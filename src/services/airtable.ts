import type { Config } from "../config.js";

export interface AirtableOrderStatus {
  status?: string;
  updatedAt?: string;
  tracking?: string;
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

  async findOrderStatus(orderNumber: string): Promise<AirtableOrderStatus | null> {
    const normalized = orderNumber.replace(/^#/, "").trim();
    const formula = `OR({${this.config.AIRTABLE_ORDER_FIELD}}=${formulaString(normalized)},{${this.config.AIRTABLE_ORDER_FIELD}}=${formulaString(`#${normalized}`)})`;
    const table = encodeURIComponent(this.config.AIRTABLE_TABLE_ID);
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
      status: String(fields[this.config.AIRTABLE_STATUS_FIELD] ?? "") || undefined,
      updatedAt: String(fields[this.config.AIRTABLE_UPDATED_FIELD] ?? "") || undefined,
      tracking: String(fields[this.config.AIRTABLE_TRACKING_FIELD] ?? "") || undefined
    };
  }
}
