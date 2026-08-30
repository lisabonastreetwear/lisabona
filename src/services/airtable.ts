import type { Config } from "../config.js";

export interface AirtableOrderStatus {
  status?: string;
  updatedAt?: string;
  tracking?: string;
  source?: "Pending" | "WTB" | "Legacy";
}

type AirtableResponse = {
  records?: Array<{ fields?: Record<string, unknown> }>;
  error?: unknown;
};

function formulaString(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

export class AirtableClient {
  constructor(private readonly config: Config) {}

  private async findInTable(
    tableId: string,
    orderField: string,
    orderNumber: string,
    fallbackStatus?: string,
    source?: AirtableOrderStatus["source"]
  ): Promise<AirtableOrderStatus | null> {
    const normalized = orderNumber.replace(/^#/, "").trim();
    const plain = formulaString(normalized);
    const hash = formulaString(`#${normalized}`);
    const formula = `OR({${orderField}}=${plain},{${orderField}}=${hash},CONCATENATE('',{${orderField}})=${plain},CONCATENATE('',{${orderField}})=${hash})`;
    const table = encodeURIComponent(tableId);
    const url = new URL(`https://api.airtable.com/v0/${this.config.AIRTABLE_BASE_ID}/${table}`);
    url.searchParams.set("maxRecords", "1");
    url.searchParams.set("filterByFormula", formula);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.config.AIRTABLE_ACCESS_TOKEN}` }
    });
    const payload = (await response.json()) as AirtableResponse;
    if (!response.ok) throw new Error(`Airtable API ${response.status}: ${JSON.stringify(payload.error)}`);
    const fields = payload.records?.[0]?.fields;
    if (!fields) return null;
    return {
      status: String(fields[this.config.AIRTABLE_STATUS_FIELD] ?? "") || fallbackStatus,
      updatedAt: String(fields[this.config.AIRTABLE_UPDATED_FIELD] ?? "") || undefined,
      tracking: String(fields[this.config.AIRTABLE_TRACKING_FIELD] ?? "") || undefined,
      source
    };
  }

  async findOrderStatus(orderNumber: string): Promise<AirtableOrderStatus | null> {
    if (this.config.AIRTABLE_PENDING_TABLE_ID && this.config.AIRTABLE_WTB_TABLE_ID) {
      const pending = await this.findInTable(
        this.config.AIRTABLE_PENDING_TABLE_ID,
        this.config.AIRTABLE_PENDING_ORDER_FIELD,
        orderNumber,
        "Pending / In Progress",
        "Pending"
      );
      if (pending) return pending;
      return this.findInTable(
        this.config.AIRTABLE_WTB_TABLE_ID,
        this.config.AIRTABLE_WTB_ORDER_FIELD,
        orderNumber,
        "WTB",
        "WTB"
      );
    }

    if (this.config.AIRTABLE_TABLE_ID) {
      return this.findInTable(
        this.config.AIRTABLE_TABLE_ID,
        this.config.AIRTABLE_ORDER_FIELD,
        orderNumber,
        undefined,
        "Legacy"
      );
    }
    return null;
  }
}
