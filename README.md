# WhatsApp Commerce Bot

MVP independente para WhatsApp Cloud API com consultas em tempo real à Shopify e ao Airtable, painel administrativo e transferência para atendimento humano.

## O que já está implementado

- Verificação e receção do webhook da Meta.
- Validação criptográfica `X-Hub-Signature-256`.
- Deduplicação de mensagens por ID.
- Menu, FAQs por palavras-chave e fluxo de consulta de encomenda.
- Confirmação da encomenda por email ou telefone antes de mostrar dados.
- Shopify Admin GraphQL API para encomenda, pagamento, fulfillment e tracking.
- Airtable Web API para estado operacional em tempo real.
- Transferência para humano com pausa temporizada ou reativação no painel.
- Painel protegido para configurações, FAQs e conversas.
- PostgreSQL, Docker, health check e configuração Railway.

## Executar localmente

Requisitos: Node.js 22 e PostgreSQL.

```bash
cp .env.example .env
npm install
npm run dev
```

O arranque aplica automaticamente a migração em `migrations/001_initial.sql`.

## Variáveis e permissões

Nunca guardar tokens no Git. Usar variáveis privadas no Railway.

### Meta

- `META_VERIFY_TOKEN`: valor aleatório escolhido por nós para validar o webhook.
- `META_APP_SECRET`: segredo da aplicação Meta.
- `META_ACCESS_TOKEN`: token permanente de System User.
- `META_PHONE_NUMBER_ID`: identificador do número.
- `META_GRAPH_VERSION`: versão atualmente configurada/suportada pela aplicação Meta.

URL do webhook: `https://SEU-DOMINIO/webhooks/meta`.

### Shopify

Criar uma custom app com, no mínimo, `read_orders`. Encomendas com mais de 60 dias podem exigir `read_all_orders`, sujeito à aprovação/configuração da Shopify.

- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET` para apps atuais criadas no Dev Dashboard. A aplicação obtém e renova automaticamente o token de 24 horas.
- `SHOPIFY_ADMIN_ACCESS_TOKEN` apenas para uma app legacy criada diretamente no Admin antes de 2026.
- `SHOPIFY_API_VERSION` (por omissão `2026-07`)

### Airtable

Criar um Personal Access Token com acesso de leitura apenas à base necessária e scope de leitura de records.

- `AIRTABLE_ACCESS_TOKEN`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_TABLE_ID`
- nomes das quatro colunas configuráveis no `.env.example`

## Deployment no Railway

1. Criar um projeto ligado a este repositório GitHub.
2. Adicionar PostgreSQL e copiar `DATABASE_URL` para o serviço (normalmente é injetado automaticamente).
3. Adicionar todas as variáveis obrigatórias.
4. Gerar um domínio Railway ou associar `bot.seudominio.pt`.
5. Confirmar `GET /health`.
6. Só depois registar e verificar o webhook na Meta.

## Limitações conhecidas do MVP

- O processamento começa depois de responder `200` ao webhook, mas ainda vive no mesmo processo. Antes de aumentar substancialmente o volume, deve ser movido para uma fila persistente.
- O painel usa HTTP Basic Auth. É adequado para o primeiro release sobre HTTPS com password forte; posteriormente pode ser substituído por SSO ou magic link.
- É necessário confirmar em ambiente real o comportamento de coexistência e atendimento no Meta Business Suite antes de ligar o número de produção.
