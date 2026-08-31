import type { Config } from "../config.js";

export interface EscalationAlert {
  channel?: string;
  customerId: string;
  displayName?: string;
  reason: string;
  message?: string;
}

function masked(value: string): string {
  if (value.startsWith("simulator-")) return "simulador";
  const tail = value.replace(/\D/g, "").slice(-4);
  return tail ? `•••• ${tail}` : "identificador oculto";
}

function safeText(value: string): string {
  return value.replaceAll("<", "‹").replaceAll(">", "›").trim();
}

export class SlackNotifier {
  constructor(private readonly config: Config) {}

  async notifyEscalation(alert: EscalationAlert): Promise<void> {
    if (!this.config.SLACK_WEBHOOK_URL) return;
    const environment = alert.channel === "simulator" ? "🧪 SIMULADOR" : "🔴 ATENDIMENTO HUMANO";
    const details = [
      environment,
      `Canal: ${safeText(alert.channel ?? "whatsapp")}`,
      `Cliente: ${alert.displayName ? safeText(alert.displayName) : "Sem nome"}`,
      `Contacto: ${masked(alert.customerId)}`,
      `Motivo: ${safeText(alert.reason)}`,
      alert.message ? `Mensagem: ${safeText(alert.message).slice(0, 500)}` : undefined,
      this.config.PUBLIC_BASE_URL ? `Painel: ${this.config.PUBLIC_BASE_URL}/admin/conversations` : undefined
    ].filter(Boolean);
    const response = await fetch(this.config.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: details.join("\n") })
    });
    if (!response.ok) throw new Error(`Slack webhook ${response.status}`);
  }
}
