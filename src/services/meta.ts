import type { Config } from "../config.js";

export class MetaClient {
  constructor(private readonly config: Config) {}

  async sendText(to: string, body: string): Promise<string | undefined> {
    if (!this.config.META_GRAPH_VERSION) throw new Error("META_GRAPH_VERSION não configurada");
    const endpoint = `https://graph.facebook.com/${this.config.META_GRAPH_VERSION}/${this.config.META_PHONE_NUMBER_ID}/messages`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body }
      })
    });
    const payload = (await response.json()) as { messages?: Array<{ id: string }>; error?: unknown };
    if (!response.ok) throw new Error(`Meta API ${response.status}: ${JSON.stringify(payload.error)}`);
    return payload.messages?.[0]?.id;
  }
}

export interface IncomingMessage {
  id: string;
  from: string;
  type: string;
  text: string;
  displayName?: string;
  raw: unknown;
}

type MetaWebhook = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string; payload?: string };
          interactive?: {
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        }>;
      };
    }>;
  }>;
};

export function extractIncomingMessages(payload: MetaWebhook): IncomingMessage[] {
  const result: IncomingMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const contactName = value?.contacts?.[0]?.profile?.name;
      for (const message of value?.messages ?? []) {
        if (!message.id || !message.from) continue;
        const text =
          message.text?.body ??
          message.button?.text ??
          message.button?.payload ??
          message.interactive?.button_reply?.title ??
          message.interactive?.button_reply?.id ??
          message.interactive?.list_reply?.title ??
          message.interactive?.list_reply?.id ??
          "";
        result.push({
          id: message.id,
          from: message.from,
          type: message.type ?? "unknown",
          text,
          displayName: contactName,
          raw: message
        });
      }
    }
  }
  return result;
}
