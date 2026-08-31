import type { Database } from "../db.js";

type Messenger = { sendText(to: string, body: string): Promise<string | undefined> };
type Slack = { notifyEscalation(alert: { channel?: string; customerId: string; reason: string; message?: string }): Promise<void> };

const messages = [
  "Continuo a acompanhar o seu caso. Ainda estou a aguardar a confirmação da equipa e, assim que tiver novidades, digo-lhe de imediato.",
  "Uma nota rápida para que não fique sem informação: o seu pedido continua a ser verificado pela nossa equipa. Estou a acompanhar de perto.",
  "Peço desculpa pela demora. O seu caso está agora marcado como prioritário junto da nossa equipa.",
  "O seu caso passa agora integralmente para um membro da nossa equipa, que assumirá a conversa e dará uma resposta definitiva."
];
const thresholds = [60, 180, 360, 1440];

export async function openSupportCase(db: Database, waId: string, channel: string | undefined, reason: string): Promise<void> {
  if (channel === "simulator") return;
  const existing = await db.query("SELECT 1 FROM support_cases WHERE wa_id = $1 AND status = 'open' LIMIT 1", [waId]);
  if (existing.rowCount) return;
  await db.query("INSERT INTO support_cases (wa_id, channel, reason) VALUES ($1, $2, $3)", [waId, channel ?? "whatsapp", reason]);
}

function businessMinutesBetween(start: Date, end: Date): number {
  let cursor = new Date(start);
  let minutes = 0;
  while (cursor < end) {
    const lisbon = new Date(cursor.toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
    const day = lisbon.getDay();
    const hour = lisbon.getHours();
    if (day >= 1 && day <= 5 && hour >= 9 && hour < 18) minutes++;
    cursor = new Date(cursor.getTime() + 60_000);
  }
  return minutes;
}

export async function runFollowups(db: Database, messenger: Messenger, slack: Slack): Promise<void> {
  const result = await db.query<{ id: string; wa_id: string; channel: string; reason: string; followups_sent: number; opened_at: Date }>(
    "SELECT id, wa_id, channel, reason, followups_sent, opened_at FROM support_cases WHERE status = 'open' ORDER BY opened_at LIMIT 100"
  );
  for (const item of result.rows) {
    const step = item.followups_sent;
    if (step >= thresholds.length || businessMinutesBetween(item.opened_at, new Date()) < thresholds[step]!) continue;
    try {
      const metaId = await messenger.sendText(item.wa_id, messages[step]!);
      await db.query("INSERT INTO outbound_messages (meta_message_id, wa_id, body) VALUES ($1, $2, $3)", [metaId ?? null, item.wa_id, messages[step]!]);
      await slack.notifyEscalation({ channel: item.channel, customerId: item.wa_id, reason: `Seguimento SLA T+${[1, 3, 6, 24][step]}h`, message: item.reason });
      await db.query("UPDATE support_cases SET followups_sent = $2, status = CASE WHEN $2 >= 4 THEN 'handed_off' ELSE status END, updated_at = now() WHERE id = $1", [item.id, step + 1]);
    } catch (error) {
      console.error("Falha no seguimento de apoio", { caseId: item.id, error });
    }
  }
}
