import crypto from "node:crypto";
import type { RequestHandler } from "express";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function basicAuth(username: string, password: string): RequestHandler {
  return (request, response, next) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Basic ")) {
      response.setHeader("WWW-Authenticate", 'Basic realm="Chatbot Admin"');
      response.status(401).send("Autenticação necessária");
      return;
    }

    let supplied = "";
    try {
      supplied = Buffer.from(header.slice(6), "base64").toString("utf8");
    } catch {
      response.status(401).send("Credenciais inválidas");
      return;
    }

    const separator = supplied.indexOf(":");
    const suppliedUser = separator >= 0 ? supplied.slice(0, separator) : "";
    const suppliedPassword = separator >= 0 ? supplied.slice(separator + 1) : "";
    if (!safeEqual(suppliedUser, username) || !safeEqual(suppliedPassword, password)) {
      response.status(401).send("Credenciais inválidas");
      return;
    }
    next();
  };
}

export function verifyMetaSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret || !signature.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return safeEqual(signature, expected);
}

export function escapeHtml(input: unknown): string {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
