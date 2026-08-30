import { loadConfig } from "./config.js";
import { createDatabase, migrate } from "./db.js";
import { createApp } from "./app.js";

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);

await migrate(db);
const app = createApp(config, db);
const server = app.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado na porta ${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`A terminar após ${signal}`);
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
