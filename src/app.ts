import express from "express";
import type { Config } from "./config.js";
import { integrationState } from "./config.js";
import type { Database } from "./db.js";
import { basicAuth, verifyMetaSignature } from "./security.js";
import { createAdminRouter } from "./admin.js";
import { extractIncomingMessages, MetaClient } from "./services/meta.js";
import { ShopifyClient } from "./services/shopify.js";
import { AirtableClient } from "./services/airtable.js";
import { SlackNotifier } from "./services/slack.js";
import { processIncomingMessage } from "./bot/processor.js";

export function createApp(config: Config, db: Database) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    express.json({
      limit: "1mb",
      verify: (request, _response, buffer) => {
        (request as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      }
    })
  );
  app.use(express.urlencoded({ extended: false, limit: "128kb" }));

  const states = integrationState(config);
  const dependencies = {
    db,
    meta: new MetaClient(config),
    shopify: new ShopifyClient(config),
    airtable: new AirtableClient(config),
    slack: new SlackNotifier(config),
    integrations: states
  };

  app.get("/health", async (_request, response) => {
    try {
      await db.query("SELECT 1");
      response.json({ ok: true, integrations: states });
    } catch {
      response.status(503).json({ ok: false });
    }
  });

  app.get("/webhooks/meta", (request, response) => {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];
    if (mode === "subscribe" && token === config.META_VERIFY_TOKEN && challenge) {
      response.status(200).send(String(challenge));
      return;
    }
    response.sendStatus(403);
  });

  app.post("/webhooks/meta", (request, response) => {
    const rawBody = (request as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    if (!verifyMetaSignature(rawBody, request.header("x-hub-signature-256"), config.META_APP_SECRET)) {
      response.sendStatus(401);
      return;
    }
    const messages = extractIncomingMessages(request.body);
    response.sendStatus(200);
    for (const message of messages) {
      void processIncomingMessage(dependencies, message).catch((error) => {
        console.error("Falha ao processar mensagem", { messageId: message.id, error });
      });
    }
  });

  app.use(
    "/admin",
    basicAuth(config.ADMIN_USERNAME, config.ADMIN_PASSWORD),
    createAdminRouter(db, config, dependencies)
  );

  app.get("/", (_request, response) => response.redirect("/admin"));
  app.use((_request, response) => response.status(404).json({ error: "Not found" }));
  return app;
}
