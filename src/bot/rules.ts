export type Intent = "menu" | "order" | "faq" | "human" | "unknown";

const HUMAN_TERMS = ["humano", "pessoa", "assistente", "apoio", "operador", "atendimento"];
const ORDER_TERMS = ["encomenda", "pedido", "order", "tracking", "rastreio", "onde está"];
const MENU_TERMS = ["menu", "inicio", "início", "olá", "ola", "bom dia", "boa tarde", "boa noite"];

export function normalizeText(text: string): string {
  return text.trim().toLocaleLowerCase("pt-PT");
}

export function classifyIntent(text: string): Intent {
  const normalized = normalizeText(text);
  if (normalized === "3" || HUMAN_TERMS.some((term) => normalized.includes(term))) return "human";
  if (normalized === "1" || ORDER_TERMS.some((term) => normalized.includes(term))) return "order";
  if (normalized === "2" || normalized.includes("faq") || normalized.includes("pergunta")) return "faq";
  if (MENU_TERMS.some((term) => normalized === term || normalized.startsWith(`${term} `))) return "menu";
  return "unknown";
}

export function extractOrderNumber(text: string): string | null {
  const match = text.trim().match(/#?([A-Za-z0-9-]{3,30})/);
  return match?.[1] ?? null;
}

export function identityLooksValid(text: string): boolean {
  const value = text.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return true;
  return value.replace(/\D/g, "").length >= 7;
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
