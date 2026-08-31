import type { Database } from "../db.js";
import { getSetting } from "../db.js";
import type { IncomingMessage } from "../services/meta.js";
import type { ShopifyClient } from "../services/shopify.js";
import { customerMatchesOrder, type ShopifyProductMatch } from "../services/shopify.js";
import type { AirtableClient } from "../services/airtable.js";
import { openSupportCase } from "../services/followups.js";
import { matchCanonicalKnowledge } from "./knowledge.js";
import {
  classifyIntent,
  describeOrderItem,
  detectLanguage,
  extractOrderNumber,
  identityLooksValid,
  isCriticalOrderItem,
  normalizeText
} from "./rules.js";

type Conversation = {
  state: string;
  context: Record<string, unknown>;
  human_handoff: boolean;
  handoff_until: Date | null;
};

export interface BotDependencies {
  db: Database;
  meta: { sendText(to: string, body: string): Promise<string | undefined> };
  shopify: ShopifyClient;
  airtable: AirtableClient;
  slack: { notifyEscalation(alert: { channel?: string; customerId: string; displayName?: string; reason: string; message?: string }): Promise<void> };
  integrations: { meta: boolean; shopify: boolean; airtable: boolean; slack: boolean };
}

async function reply(deps: BotDependencies, waId: string, body: string): Promise<void> {
  const metaId = await deps.meta.sendText(waId, body);
  await deps.db.query(
    "INSERT INTO outbound_messages (meta_message_id, wa_id, body) VALUES ($1, $2, $3)",
    [metaId ?? null, waId, body]
  );
}

async function updateConversation(
  db: Database,
  waId: string,
  state: string,
  context: Record<string, unknown> = {},
  handoff = false,
  handoffUntil: Date | null = null
) {
  await db.query(
    `UPDATE conversations
     SET state = $2, context = $3::jsonb, human_handoff = $4, handoff_until = $5, updated_at = now()
     WHERE wa_id = $1`,
    [waId, state, JSON.stringify(context), handoff, handoffUntil]
  );
}

async function matchFaq(db: Database, message: string): Promise<string | null> {
  const result = await db.query<{ answer: string; keywords: string[] }>(
    "SELECT answer, keywords FROM faq_entries WHERE enabled = true ORDER BY sort_order, id"
  );
  const normalized = normalizeText(message);
  return (
    result.rows.find((entry) => entry.keywords.some((keyword) => normalized.includes(normalizeText(keyword))))
      ?.answer ?? null
  );
}

function deadlineFrom(text: string): string | undefined {
  return text.match(/\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/)?.[0]
    ?? text.match(/\b\d{1,2}\s+(?:de\s+)?(?:janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|mayo|junio|julio|septiembre|octubre|noviembre|diciembre)\b/i)?.[0];
}

async function answerProductAvailability(
  deps: BotDependencies,
  message: IncomingMessage,
  language: string,
  product: ShopifyProductMatch,
  variant: ShopifyProductMatch["variants"][number]
): Promise<void> {
  const size = /^(default title|one size|os|tamanho único|único)$/i.test(variant.title) ? undefined : variant.title;
  const deadline = deadlineFrom(message.text);
  await updateConversation(deps.db, message.from, "idle");
  if (variant.inventoryQuantity > 0) {
    const timing = "48 horas";
    const label = product.title + (size ? ", tamanho " + size : "");
    const answer = language === "en"
      ? "Good news: " + label + " is in stock and can be dispatched within 48 hours."
      : language === "es"
        ? "Buenas noticias: " + label + " está en stock y puede enviarse en 48 horas."
        : "Boas notícias: " + label + " está em stock e pode seguir em " + timing + ".";
    await reply(deps, message.from, answer);
  } else if (variant.availableForSale) {
    const label = product.title + (size ? ", tamanho " + size : "");
    const answer = language === "en"
      ? label + " is available to order. The usual lead time is around 5 business days until it reaches our facilities; it is dispatched on the day it arrives."
      : language === "es"
        ? label + " está disponible bajo pedido. El plazo habitual es de unos 5 días laborables hasta que llegue a nuestras instalaciones; se envía el mismo día de su llegada."
        : label + " está disponível por encomenda. O prazo habitual é de cerca de 5 dias úteis até dar entrada nas nossas instalações; segue para si no próprio dia em que chega.";
    await reply(deps, message.from, answer);
  } else {
    await reply(deps, message.from, language === "en" ? "This item is not currently available. I have asked our team to check alternatives."
      : language === "es" ? "Este artículo no está disponible actualmente. He pedido a nuestro equipo que compruebe alternativas."
      : "Este artigo não está disponível neste momento. Pedi à nossa equipa que verifique alternativas.");
    await deps.slack.notifyEscalation({ channel: message.channel, customerId: message.from, displayName: message.displayName, reason: "Produto Shopify indisponível; verificar alternativas", message: product.title }).catch(console.error);
    await openSupportCase(deps.db, message.from, message.channel, "Alternativas para " + product.title);
  }
  if (deadline) {
    await deps.slack.notifyEscalation({ channel: message.channel, customerId: message.from, displayName: message.displayName, reason: "Pedido de produto com data limite", message: product.title + " · " + deadline }).catch(console.error);
    await openSupportCase(deps.db, message.from, message.channel, "Confirmar data limite para " + product.title + ": " + deadline);
  }
}

async function handleNaturalProductSearch(deps: BotDependencies, message: IncomingMessage, language: string): Promise<void> {
  const matches = await deps.shopify.findProductMatches(message.text).catch(() => []);
  if (!matches.length) {
    await updateConversation(deps.db, message.from, "awaiting_stock_details", { language });
    await reply(deps, message.from, language === "en" ? "Which product are you looking for? You can write the model and colour naturally."
      : language === "es" ? "¿Qué producto busca? Puede escribir el modelo y el color con naturalidad."
      : "Que artigo procura? Pode escrever o modelo e a cor naturalmente.");
    return;
  }
  const product = matches[0]!;
  const availableVariants = product.variants.filter((variant) => variant.availableForSale);
  const candidates = availableVariants.length ? availableVariants : product.variants;
  const normalized = normalizeText(message.text);
  const variant = candidates.length === 1 ? candidates[0]
    : candidates.find((item) => normalizeText(item.title).split(/\s+/).every((token) => normalized.includes(token)));
  if (!variant) {
    await updateConversation(deps.db, message.from, "awaiting_stock_variant", { language, product });
    const choices = candidates.slice(0, 12).map((item) => item.title).join(", ");
    await reply(deps, message.from, language === "en" ? "I found " + product.title + ". Which size or variant do you want? " + choices
      : language === "es" ? "He encontrado " + product.title + ". ¿Qué talla o variante desea? " + choices
      : "Encontrei " + product.title + ". Que tamanho ou variante pretende? " + choices);
    return;
  }
  await answerProductAvailability(deps, message, language, product, variant);
}

export async function processIncomingMessage(
  deps: BotDependencies,
  message: IncomingMessage
): Promise<void> {
  await deps.db.query(
    `INSERT INTO contacts (wa_id, display_name, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (wa_id) DO UPDATE
       SET display_name = COALESCE(EXCLUDED.display_name, contacts.display_name), updated_at = now()`,
    [message.from, message.displayName ?? null]
  );
  await deps.db.query(
    "INSERT INTO conversations (wa_id) VALUES ($1) ON CONFLICT (wa_id) DO NOTHING",
    [message.from]
  );
  const inserted = await deps.db.query(
    `INSERT INTO inbound_messages (message_id, wa_id, message_type, body, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING message_id`,
    [message.id, message.from, message.type, message.text, JSON.stringify(message.raw)]
  );
  if (inserted.rowCount === 0) return;

  try {
    const botEnabled = await getSetting(deps.db, "bot_enabled", true);
    if (!botEnabled) return;
    const result = await deps.db.query<Conversation>(
      "SELECT state, context, human_handoff, handoff_until FROM conversations WHERE wa_id = $1",
      [message.from]
    );
    const conversation = result.rows[0];
    if (!conversation) throw new Error("Conversa não encontrada");

    if (
      conversation.human_handoff &&
      (!conversation.handoff_until || conversation.handoff_until.getTime() > Date.now())
    ) {
      return;
    }
    if (conversation.human_handoff) {
      await updateConversation(deps.db, message.from, "idle");
      conversation.state = "idle";
      conversation.context = {};
    }

    const intent = classifyIntent(message.text);
    if (intent === "human") {
      const hours = await getSetting(deps.db, "handoff_hours", 24);
      const until = new Date(Date.now() + Number(hours) * 60 * 60 * 1000);
      await updateConversation(deps.db, message.from, "human", {}, true, until);
      await deps.slack.notifyEscalation({
        channel: message.channel,
        customerId: message.from,
        displayName: message.displayName,
        reason: "Pedido explícito de atendimento humano",
        message: message.text
      }).catch((error) => console.error("Falha ao notificar Slack", error));
      await reply(
        deps,
        message.from,
        await getSetting(deps.db, "handoff_message", "Encaminhei a conversa para a nossa equipa.")
      );
      return;
    }

    if (conversation.state === "awaiting_order_number") {
      const orderNumber = extractOrderNumber(message.text);
      if (!orderNumber) {
        await reply(deps, message.from, "Não reconheci o número. Envia-o no formato #1234, por favor.");
        return;
      }
      await updateConversation(deps.db, message.from, "awaiting_identity", { orderNumber, identityAttempts: 0 });
      await reply(deps, message.from, "Agora indique o email utilizado na compra, por favor.");
      return;
    }

    if (conversation.state === "awaiting_identity") {
      if (!identityLooksValid(message.text)) {
        await reply(deps, message.from, "Indique um endereço de email válido, por favor.");
        return;
      }
      if (!deps.integrations.shopify) {
        await reply(deps, message.from, "A consulta de encomendas está temporariamente indisponível. Vou chamar a nossa equipa.");
        await updateConversation(deps.db, message.from, "human", {}, true, new Date(Date.now() + 86400000));
        return;
      }
      const orderNumber = String(conversation.context.orderNumber ?? "");
      const order = await deps.shopify.findOrder(orderNumber);
      if (!order || !customerMatchesOrder(order, message.text, message.from)) {
        const attempts = Number(conversation.context.identityAttempts ?? 0) + 1;
        if (attempts < 2) {
          await updateConversation(deps.db, message.from, "awaiting_identity", { orderNumber, identityAttempts: attempts });
          await reply(deps, message.from, "Não consigo associar esse email a essa encomenda. Pode confirmar o email utilizado na compra?");
          return;
        }
        const until = new Date(Date.now() + 86400000);
        await updateConversation(deps.db, message.from, "human", {}, true, until);
        await deps.slack.notifyEscalation({ channel: message.channel, customerId: message.from, displayName: message.displayName, reason: "Duas tentativas de validação de email falharam", message: `Encomenda #${orderNumber}` }).catch(console.error);
        await reply(deps, message.from, "Não foi possível confirmar os dados. Encaminhei o pedido para a nossa equipa, que dará seguimento em horário útil.");
        return;
      }
      const items = deps.integrations.airtable ? await deps.airtable.findOrderItems(orderNumber) : [];
      await updateConversation(deps.db, message.from, "idle");
      if (!items.length) {
        const until = new Date(Date.now() + 86400000);
        await updateConversation(deps.db, message.from, "human", {}, true, until);
        await deps.slack.notifyEscalation({ channel: message.channel, customerId: message.from, displayName: message.displayName, reason: "Encomenda validada sem artigos encontrados no estado operacional", message: order.name }).catch(console.error);
        await openSupportCase(deps.db, message.from, message.channel, "Encomenda sem estado operacional");
        await reply(deps, message.from, "Confirmei a encomenda, mas preciso que a nossa equipa verifique o estado atual. O pedido ficou registado para acompanhamento.");
        return;
      }
      const response = [`Encontrei a encomenda ${order.name}. Estado por artigo:`, "", ...items.map(describeOrderItem)].join("\n");
      await reply(deps, message.from, response);
      await deps.airtable.appendChatbotNote(items, "Estado comunicado ao cliente pelo chatbot").catch((error) => console.error("Falha ao registar nota Airtable", error));
      const critical = items.filter(isCriticalOrderItem);
      if (critical.length) {
        await deps.slack.notifyEscalation({ channel: message.channel, customerId: message.from, displayName: message.displayName, reason: `Encomenda com ${critical.length} artigo(s) que requer(em) acompanhamento`, message: order.name }).catch(console.error);
        await openSupportCase(deps.db, message.from, message.channel, `Estado crítico na encomenda ${order.name}`);
      }
      return;
    }

    if (conversation.state === "awaiting_stock_details") {
      const language = String(conversation.context.language ?? "pt");
      await handleNaturalProductSearch(deps, message, language);
      return;
    }

    if (conversation.state === "awaiting_stock_variant") {
      const language = String(conversation.context.language ?? "pt");
      const product = conversation.context.product as ShopifyProductMatch | undefined;
      const normalized = normalizeText(message.text);
      const variant = product?.variants.find((item) => normalizeText(item.title) === normalized || normalizeText(item.title).includes(normalized));
      if (!product || !variant) {
        await reply(deps, message.from, language === "en" ? "I did not recognise that variant. Please indicate one of the options shown."
          : language === "es" ? "No he reconocido esa variante. Indique una de las opciones mostradas."
          : "Não reconheci essa variante. Indique uma das opções apresentadas, por favor.");
        return;
      }
      await answerProductAvailability(deps, message, language, product, variant);
      return;
    }

    if (intent === "order") {
      await updateConversation(deps.db, message.from, "awaiting_order_number");
      await reply(deps, message.from, "Claro. Qual é o número da encomenda? Exemplo: #1234");
      return;
    }

    if (intent === "stock") {
      const language = detectLanguage(message.text);
      await handleNaturalProductSearch(deps, message, language);
      return;
    }

    const canonical = matchCanonicalKnowledge(message.text);
    if (canonical) {
      await reply(deps, message.from, canonical);
      if (/defeito|danificado|artigo errado|produto errado/i.test(normalizeText(message.text))) {
        const until = new Date(Date.now() + 86400000);
        await updateConversation(deps.db, message.from, "human", {}, true, until);
        await deps.slack.notifyEscalation({ channel: message.channel, customerId: message.from, displayName: message.displayName, reason: "Artigo com defeito, danificado ou incorreto", message: message.text }).catch(console.error);
        await openSupportCase(deps.db, message.from, message.channel, "Artigo com defeito, danificado ou incorreto");
      }
      return;
    }
    const faq = await matchFaq(deps.db, message.text);
    if (faq) {
      await reply(deps, message.from, faq);
      return;
    }
    if (intent === "faq") {
      await reply(deps, message.from, "Escreve a tua pergunta. Se não encontrar a resposta, podes escrever “pessoa”.");
      return;
    }
    if (intent === "menu") {
      await reply(deps, message.from, await getSetting(deps.db, "welcome_message", "Como podemos ajudar?"));
      return;
    }
    const productMatches = await deps.shopify.findProductMatches(message.text).catch(() => []);
    if (productMatches.length) {
      await handleNaturalProductSearch(deps, message, detectLanguage(message.text));
      return;
    }
    await reply(deps, message.from, await getSetting(deps.db, "fallback_message", "Não consegui perceber."));
  } catch (error) {
    const description = error instanceof Error ? error.message : String(error);
    await deps.db.query(
      "UPDATE inbound_messages SET processing_error = $2 WHERE message_id = $1",
      [message.id, description.slice(0, 2000)]
    );
    throw error;
  } finally {
    await deps.db.query(
      "UPDATE inbound_messages SET processed_at = now() WHERE message_id = $1",
      [message.id]
    );
  }
}
