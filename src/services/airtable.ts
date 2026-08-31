import type { Config } from "../config.js";

export type AirtableSource = "Pending" | "WTB" | "Legacy";
export interface AirtableOrderItem {
  recordId: string; source: AirtableSource; name: string; sku?: string; size?: string;
  origin?: string; logisticsStatus?: string; fulfillment?: string; status?: string;
  orderStatus?: string; businessDays?: number; daysSinceProcessed?: number;
  tracking?: string; updatedAt?: string; chatbotNotes?: string;
}
type AirtableRecord = { id: string; fields?: Record<string, unknown> };
type AirtableResponse = { records?: AirtableRecord[]; error?: unknown };

function formulaString(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}
function stringField(fields: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = fields[name];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}
function numberField(fields: Record<string, unknown>, ...names: string[]): number | undefined {
  const value = stringField(fields, ...names);
  if (!value) return undefined;
  const parsed = Number(value.replace(",", ".").match(/-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class AirtableClient {
  constructor(private readonly config: Config) {}

  private async request(url: URL, init: RequestInit = {}): Promise<AirtableResponse> {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.config.AIRTABLE_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init.headers }
    });
    const payload = (await response.json()) as AirtableResponse;
    if (!response.ok) throw new Error(`Airtable API ${response.status}: ${JSON.stringify(payload.error)}`);
    return payload;
  }

  private async findAllInTable(tableId: string, orderField: string, orderNumber: string, source: AirtableSource): Promise<AirtableOrderItem[]> {
    const normalized = orderNumber.replace(/^#/, "").trim();
    const plain = formulaString(normalized);
    const hash = formulaString(`#${normalized}`);
    const formula = `OR({${orderField}}=${plain},{${orderField}}=${hash},CONCATENATE('',{${orderField}})=${plain},CONCATENATE('',{${orderField}})=${hash})`;
    const url = new URL(`https://api.airtable.com/v0/${this.config.AIRTABLE_BASE_ID}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", formula);
    const payload = await this.request(url);
    return (payload.records ?? []).map((record) => {
      const fields = record.fields ?? {};
      return {
        recordId: record.id, source,
        name: stringField(fields, "Name", "Product", "Product Name", "SKU") ?? "Artigo",
        sku: stringField(fields, "SKU"), size: stringField(fields, "Size"),
        origin: stringField(fields, "Origin"),
        logisticsStatus: stringField(fields, "Logistics Status"),
        fulfillment: stringField(fields, "Fulfillment"), status: stringField(fields, "Status"),
        orderStatus: stringField(fields, "Order Status"),
        businessDays: numberField(fields, "Business Days since Ordered"),
        daysSinceProcessed: numberField(fields, "Days since Processed"),
        tracking: stringField(fields, "Tracking (Customer)", this.config.AIRTABLE_TRACKING_FIELD),
        updatedAt: stringField(fields, this.config.AIRTABLE_UPDATED_FIELD, "Last Modified", "Ordered At"),
        chatbotNotes: stringField(fields, "Chatbot Notes")
      };
    });
  }

  async findOrderItems(orderNumber: string): Promise<AirtableOrderItem[]> {
    if (this.config.AIRTABLE_PENDING_TABLE_ID && this.config.AIRTABLE_WTB_TABLE_ID) {
      const [pending, wtb] = await Promise.all([
        this.findAllInTable(this.config.AIRTABLE_PENDING_TABLE_ID, this.config.AIRTABLE_PENDING_ORDER_FIELD, orderNumber, "Pending"),
        this.findAllInTable(this.config.AIRTABLE_WTB_TABLE_ID, this.config.AIRTABLE_WTB_ORDER_FIELD, orderNumber, "WTB")
      ]);
      return [...pending, ...wtb];
    }
    if (!this.config.AIRTABLE_TABLE_ID) return [];
    return this.findAllInTable(this.config.AIRTABLE_TABLE_ID, this.config.AIRTABLE_ORDER_FIELD, orderNumber, "Legacy");
  }

  async appendChatbotNote(items: AirtableOrderItem[], summary: string): Promise<void> {
    const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" }).format(new Date());
    await Promise.all(items.map(async (item) => {
      const tableId = item.source === "Pending" ? this.config.AIRTABLE_PENDING_TABLE_ID
        : item.source === "WTB" ? this.config.AIRTABLE_WTB_TABLE_ID : this.config.AIRTABLE_TABLE_ID;
      if (!tableId) return;
      const fieldId = item.source === "Pending" ? "fldo0xtBPTE6Bpcly"
        : item.source === "WTB" ? "fldEeLaeKMpnx3q3M" : "Chatbot Notes";
      const next = [item.chatbotNotes, `[${stamp}] Chatbot — ${summary}`].filter(Boolean).join("\n");
      const url = new URL(`https://api.airtable.com/v0/${this.config.AIRTABLE_BASE_ID}/${encodeURIComponent(tableId)}/${item.recordId}`);
      await this.request(url, { method: "PATCH", body: JSON.stringify({ fields: { [fieldId]: next } }) });
    }));
  }
}
