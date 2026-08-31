export type Intent = "menu" | "order" | "stock" | "faq" | "human" | "unknown";

const HUMAN_TERMS = ["humano", "pessoa", "assistente", "apoio", "operador", "atendimento"];
const ORDER_TERMS = ["encomenda", "pedido", "order", "tracking", "rastreio", "onde está"];
const MENU_TERMS = ["menu", "inicio", "início", "olá", "ola", "bom dia", "boa tarde", "boa noite"];
const STOCK_TERMS = ["em stock", "disponível", "disponivel", "receber até", "receber ate", "preciso para", "têm", "tem este", "procuro", "à procura", "gostava de comprar", "in stock", "available", "looking for", "disponible", "necesito para", "busco"];

export function normalizeText(text: string): string {
  return text.trim().toLocaleLowerCase("pt-PT");
}

export function classifyIntent(text: string): Intent {
  const normalized = normalizeText(text);
  if (normalized === "3" || HUMAN_TERMS.some((term) => normalized.includes(term))) return "human";
  if (normalized === "1" || ORDER_TERMS.some((term) => normalized.includes(term))) return "order";
  if (STOCK_TERMS.some((term) => normalized.includes(term))) return "stock";
  if (normalized === "2" || normalized.includes("faq") || normalized.includes("pergunta")) return "faq";
  if (MENU_TERMS.some((term) => normalized === term || normalized.startsWith(`${term} `))) return "menu";
  return "unknown";
}

export type Language = "pt" | "en" | "es";
export function detectLanguage(text: string): Language {
  const normalized = normalizeText(text);
  if (/\b(hello|hi|order|return|refund|shipping|available|size)\b/.test(normalized)) return "en";
  if (/\b(hola|pedido|devolución|reembolso|envío|disponible|talla)\b/.test(normalized)) return "es";
  return "pt";
}

export function parseStockRequest(text: string): { product: string; size: string; deadline?: string } | null {
  const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { product: parts[0]!, size: parts[1]!, deadline: parts[2] };
}

export function extractOrderNumber(text: string): string | null {
  const match = text.trim().match(/#?([A-Za-z0-9-]{3,30})/);
  return match?.[1] ?? null;
}

export function identityLooksValid(text: string): boolean {
  const value = text.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isCriticalOrderItem(item: { source: string; logisticsStatus?: string; orderStatus?: string; businessDays?: number; daysSinceProcessed?: number; tracking?: string }): boolean {
  return item.logisticsStatus === "Delay / Issue" ||
    item.orderStatus === "Product in Search - Seller not Found" ||
    (item.source === "WTB" && (item.businessDays ?? 0) >= 15) ||
    Boolean(item.tracking && (item.daysSinceProcessed ?? 0) >= 3);
}

export function describeOrderItem(item: { name: string; size?: string; source: string; origin?: string; logisticsStatus?: string; orderStatus?: string; businessDays?: number; daysSinceProcessed?: number; tracking?: string }): string {
  const label = `${item.name}${item.size ? ` · Tamanho ${item.size}` : ""}`;
  if (item.tracking) {
    if ((item.daysSinceProcessed ?? 0) >= 3) return `• ${label} — vamos averiguar o envio junto da transportadora e atualizar ainda hoje. Rastreio: ${item.tracking}`;
    return `• ${label} — já seguiu. Pode acompanhar aqui: ${item.tracking}`;
  }
  if (item.source === "WTB") {
    if ((item.businessDays ?? 0) >= 15) return `• ${label} — o prazo de 15 dias úteis foi ultrapassado. A nossa equipa vai tratar consigo do cancelamento e reembolso.`;
    if (item.orderStatus === "Deal Confirmed - Product to be Shipped") return `• ${label} — já está assegurado e a caminho das nossas instalações.`;
    if (item.orderStatus === "Deal in Progress - Negotiation Ongoing") return `• ${label} — estamos a fechar os últimos detalhes e damos uma atualização concreta nas próximas 24 horas.`;
    return `• ${label} — continuamos a localizar o artigo e a nossa equipa vai acompanhar o caso.`;
  }
  if (item.logisticsStatus === "Delay / Issue") return `• ${label} — detetámos um atraso e a nossa equipa vai verificar o caso.`;
  if (item.origin === "In-Stock") return `• ${label} — está em stock e segue em 48 horas por correio expresso.`;
  if (item.origin === "Consignment") return `• ${label} — está reservado e segue dentro de 48 horas úteis.`;
  if (item.origin === "Pre-Order") return `• ${label} — está a ser assegurado junto do fornecedor; o prazo habitual é cerca de 5 dias úteis.`;
  return `• ${label} — está em preparação. Receberá o rastreio por email assim que seguir.`;
}

export function formatOrderStatus(input: {
  orderName: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  internalStatus?: string;
  updatedAt?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}): string {
  const lines = [`Encontrei a encomenda ${input.orderName} ✅`];
  if (input.internalStatus) lines.push(`Estado: ${input.internalStatus}`);
  else if (input.fulfillmentStatus) lines.push(`Estado de envio: ${input.fulfillmentStatus}`);
  if (input.financialStatus) lines.push(`Pagamento: ${input.financialStatus}`);
  if (input.updatedAt) lines.push(`Última atualização: ${input.updatedAt}`);
  if (input.trackingNumber) lines.push(`Rastreio: ${input.trackingNumber}`);
  if (input.trackingUrl) lines.push(input.trackingUrl);
  return lines.join("\n");
}
