CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  wa_id text PRIMARY KEY,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  wa_id text PRIMARY KEY REFERENCES contacts(wa_id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'idle',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  human_handoff boolean NOT NULL DEFAULT false,
  handoff_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inbound_messages (
  message_id text PRIMARY KEY,
  wa_id text NOT NULL REFERENCES contacts(wa_id) ON DELETE CASCADE,
  message_type text NOT NULL,
  body text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id bigserial PRIMARY KEY,
  meta_message_id text,
  wa_id text NOT NULL REFERENCES contacts(wa_id) ON DELETE CASCADE,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faq_entries (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  answer text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('bot_enabled', 'true'::jsonb),
  ('welcome_message', '"Olá 👋 Bem-vindo! Como podemos ajudar?\n\n1 — Estado da encomenda\n2 — Perguntas frequentes\n3 — Falar com uma pessoa"'::jsonb),
  ('handoff_message', '"Já encaminhei a conversa para a nossa equipa 😊 Responderemos assim que possível."'::jsonb),
  ('handoff_hours', '24'::jsonb),
  ('fallback_message', '"Não consegui perceber. Responde 1 para consultar uma encomenda, 2 para ajuda ou 3 para falar com uma pessoa."'::jsonb)
ON CONFLICT (key) DO NOTHING;
