import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyIntent,
  describeOrderItem,
  extractOrderNumber,
  formatOrderStatus,
  identityLooksValid
} from "../src/bot/rules.js";
import { customerMatchesOrder } from "../src/services/shopify.js";
import { matchCanonicalKnowledge } from "../src/bot/knowledge.js";

describe("regras do chatbot", () => {
  it("reconhece intenções principais", () => {
    assert.equal(classifyIntent("1"), "order");
    assert.equal(classifyIntent("onde está a minha encomenda?"), "order");
    assert.equal(classifyIntent("quero falar com uma pessoa"), "human");
    assert.equal(classifyIntent("Olá"), "menu");
  });

  it("extrai números de encomenda", () => {
    assert.equal(extractOrderNumber("#12345"), "12345");
    assert.equal(extractOrderNumber("ABC-123"), "ABC-123");
  });

  it("valida identificadores sem aceitar fragmentos curtos", () => {
    assert.equal(identityLooksValid("cliente@example.com"), true);
    assert.equal(identityLooksValid("912345678"), false);
    assert.equal(identityLooksValid("123"), false);
  });

  it("confirma a identidade apenas por email", () => {
    const order = { name: "#123", email: "Cliente@Example.com", phone: "+351 912 345 678" };
    assert.equal(customerMatchesOrder(order, "cliente@example.com", "351900000000"), true);
    assert.equal(customerMatchesOrder(order, "912345678", "351900000000"), false);
    assert.equal(customerMatchesOrder(order, "outra@example.com", "351900000000"), false);
  });

  it("traduz estados internos sem os revelar", () => {
    const output = describeOrderItem({ name: "Air Max", source: "WTB", orderStatus: "Deal in Progress - Negotiation Ongoing" });
    assert.match(output, /últimos detalhes/);
    assert.doesNotMatch(output, /Deal in Progress/);
  });

  it("formata um estado legível", () => {
    const output = formatOrderStatus({
      orderName: "#123",
      internalStatus: "Em preparação",
      trackingNumber: "TRACK-1"
    });
    assert.match(output, /Em preparação/);
    assert.match(output, /TRACK-1/);
  });

  it("responde com políticas canónicas da KB", () => {
    assert.match(matchCanonicalKnowledge("Como faço uma troca?") ?? "", /14 dias/);
    assert.match(matchCanonicalKnowledge("Os artigos são originais?") ?? "", /originais/);
  });
});
