import { Router } from "express";
import type { Database } from "./db.js";
import { getSetting, setSetting } from "./db.js";
import { escapeHtml } from "./security.js";
import type { Config } from "./config.js";
import { integrationState } from "./config.js";

function page(title: string, content: string): string {
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  :root{font-family:Inter,system-ui,sans-serif;color:#17221d;background:#f4f7f5}body{margin:0}.wrap{max-width:980px;margin:auto;padding:28px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}nav a{margin-left:16px;color:#176b45}.card{background:white;border:1px solid #dce7e0;border-radius:14px;padding:20px;margin-bottom:18px;box-shadow:0 5px 20px #173d2910}h1,h2{margin-top:0}label{display:block;font-weight:650;margin:14px 0 6px}input,textarea{width:100%;box-sizing:border-box;padding:11px;border:1px solid #bdcdc4;border-radius:8px;font:inherit}textarea{min-height:110px}button{background:#176b45;color:white;border:0;border-radius:8px;padding:11px 16px;font-weight:700;cursor:pointer}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.status{padding:10px;border-radius:8px;background:#eef5f1}.ok{color:#176b45}.bad{color:#a23c3c}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #e4ebe7}.muted{color:#65736b;font-size:.92rem}a{color:#176b45}</style></head><body><div class="wrap"><header><strong>WhatsApp Commerce Bot</strong><nav><a href="/admin">Painel</a><a href="/admin/faqs">FAQs</a><a href="/admin/conversations">Conversas</a></nav></header>${content}</div></body></html>`;
}

export function createAdminRouter(db: Database, config: Config): Router {
  const router = Router();
  router.use(Router().use((request, response, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin && config.PUBLIC_BASE_URL && new URL(config.PUBLIC_BASE_URL).origin !== origin) {
        response.status(403).send("Origem inválida");
        return;
      }
    }
    next();
  }));

  router.get("/", async (_request, response) => {
    const [enabled, welcome, handoff, fallback, hours] = await Promise.all([
      getSetting(db, "bot_enabled", true),
      getSetting(db, "welcome_message", ""),
      getSetting(db, "handoff_message", ""),
      getSetting(db, "fallback_message", ""),
      getSetting(db, "handoff_hours", 24)
    ]);
    const states = integrationState(config);
    response.send(page("Painel", `<h1>Painel</h1><div class="row">${Object.entries(states).map(([name, ok]) => `<div class="status"><strong>${escapeHtml(name)}</strong><br><span class="${ok ? "ok" : "bad"}">${ok ? "Configurado" : "Por configurar"}</span></div>`).join("")}</div><div class="card"><h2>Comportamento</h2><form method="post" action="/admin/settings"><label><input style="width:auto" type="checkbox" name="bot_enabled" ${enabled ? "checked" : ""}> Bot ativo</label><label>Mensagem inicial</label><textarea name="welcome_message">${escapeHtml(welcome)}</textarea><label>Mensagem de transferência</label><textarea name="handoff_message">${escapeHtml(handoff)}</textarea><label>Mensagem quando não percebe</label><textarea name="fallback_message">${escapeHtml(fallback)}</textarea><label>Horas de pausa após transferência</label><input type="number" min="1" max="168" name="handoff_hours" value="${escapeHtml(hours)}"><br><br><button>Guardar</button></form></div>`));
  });

  router.post("/settings", async (request, response) => {
    await Promise.all([
      setSetting(db, "bot_enabled", request.body.bot_enabled === "on"),
      setSetting(db, "welcome_message", String(request.body.welcome_message ?? "")),
      setSetting(db, "handoff_message", String(request.body.handoff_message ?? "")),
      setSetting(db, "fallback_message", String(request.body.fallback_message ?? "")),
      setSetting(db, "handoff_hours", Math.max(1, Math.min(168, Number(request.body.handoff_hours) || 24)))
    ]);
    response.redirect("/admin");
  });

  router.get("/faqs", async (_request, response) => {
    const result = await db.query("SELECT * FROM faq_entries ORDER BY sort_order, id");
    response.send(page("FAQs", `<h1>Respostas automáticas</h1><div class="card"><form method="post" action="/admin/faqs"><label>Título interno</label><input name="title" required><label>Palavras-chave (separadas por vírgulas)</label><input name="keywords" required><label>Resposta</label><textarea name="answer" required></textarea><button>Adicionar</button></form></div><div class="card"><table><thead><tr><th>Título</th><th>Palavras-chave</th><th>Ativa</th><th></th></tr></thead><tbody>${result.rows.map((row) => `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.keywords.join(", "))}</td><td>${row.enabled ? "Sim" : "Não"}</td><td><form method="post" action="/admin/faqs/${row.id}/delete"><button>Apagar</button></form></td></tr>`).join("")}</tbody></table></div>`));
  });

  router.post("/faqs", async (request, response) => {
    const keywords = String(request.body.keywords ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    await db.query("INSERT INTO faq_entries (title, keywords, answer) VALUES ($1, $2, $3)", [String(request.body.title), keywords, String(request.body.answer)]);
    response.redirect("/admin/faqs");
  });

  router.post("/faqs/:id/delete", async (request, response) => {
    await db.query("DELETE FROM faq_entries WHERE id = $1", [request.params.id]);
    response.redirect("/admin/faqs");
  });

  router.get("/conversations", async (_request, response) => {
    const result = await db.query(`SELECT c.wa_id, c.display_name, v.state, v.human_handoff, v.handoff_until, v.updated_at FROM conversations v JOIN contacts c USING (wa_id) ORDER BY v.updated_at DESC LIMIT 100`);
    response.send(page("Conversas", `<h1>Conversas</h1><div class="card"><table><thead><tr><th>Cliente</th><th>Estado</th><th>Humano</th><th>Atualização</th><th></th></tr></thead><tbody>${result.rows.map((row) => `<tr><td>${escapeHtml(row.display_name || row.wa_id)}<div class="muted">${escapeHtml(row.wa_id)}</div></td><td>${escapeHtml(row.state)}</td><td>${row.human_handoff ? `Até ${escapeHtml(row.handoff_until ?? "manual")}` : "Não"}</td><td>${escapeHtml(row.updated_at)}</td><td>${row.human_handoff ? `<form method="post" action="/admin/conversations/${encodeURIComponent(row.wa_id)}/resume"><button>Reativar bot</button></form>` : ""}</td></tr>`).join("")}</tbody></table></div>`));
  });

  router.post("/conversations/:waId/resume", async (request, response) => {
    await db.query("UPDATE conversations SET state = 'idle', context = '{}'::jsonb, human_handoff = false, handoff_until = null, updated_at = now() WHERE wa_id = $1", [request.params.waId]);
    response.redirect("/admin/conversations");
  });
  return router;
}
