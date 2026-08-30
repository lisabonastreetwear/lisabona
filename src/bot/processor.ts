import type { Database } from "../db.js";
import { getSetting } from "../db.js";
import type { IncomingMessage, MetaClient } from "../services/meta.js";
import type { ShopifyClient } from "../services/shopify.js";
import { customerMatchesOrder } from "../services/shopify.js";
import type { AirtableClient } from "../services/airtable.js";
import {
  classifyIntent,
  extractOrderNumber,
  formatOrderStatus,
  identityLooksValid,
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
  meta: MetaClient;
  shopify: ShopifyClient;
  airtable: AirtableClient;
  integrations: { meta: boolean; shopify: boolean; airtable: boolean };
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
      await updateConversation(deps.db, message.from, "awaiting_identity", { orderNumber });
      await reply(deps, message.from, "Agora envia o email ou telefone usado na encomenda.");
      return;
    }

    if (conversation.state === "awaiting_identity") {
      if (!identityLooksValid(message.text)) {
        await reply(deps, message.from, "Envia um email válido ou o número de telefone da encomenda.");
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
        await updateConversation(deps.db, message.from, "idle");
        await reply(deps, message.from, "Não consegui confirmar esses dados. Confirma o número e o email/telefone ou escreve “pessoa”.");
        return;
      }
      const airtable = deps.integrations.airtable
        ? await deps.airtable.findOrderStatus(orderNumber).catch(() => null)
        : null;
      await updateConversation(deps.db, message.from, "idle");
      await reply(
        deps,
        message.from,
        formatOrderStatus({
          orderName: order.name,
          financialStatus: order.financialStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          internalStatus: airtable?.status,
          updatedAt: airtable?.updatedAt,
          trackingNumber: order.trackingNumber ?? airtable?.tracking,
          trackingUrl: order.trackingUrl
        })
      );
      return;
    }

    if (intent === "order") {
      await updateConversation(deps.db, message.from, "awaiting_order_number");
      await reply(deps, message.from, "Claro. Qual é o número da encomenda? Exemplo: #1234");
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
