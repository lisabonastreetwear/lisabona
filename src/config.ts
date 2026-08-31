import { z } from "zod";

const optionalSecret = z.string().trim().optional().default("");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(12),
  META_VERIFY_TOKEN: optionalSecret,
  META_APP_SECRET: optionalSecret,
  META_ACCESS_TOKEN: optionalSecret,
  META_PHONE_NUMBER_ID: optionalSecret,
  META_GRAPH_VERSION: optionalSecret,
  SHOPIFY_STORE_DOMAIN: optionalSecret,
  SHOPIFY_ADMIN_ACCESS_TOKEN: optionalSecret,
  SHOPIFY_CLIENT_ID: optionalSecret,
  SHOPIFY_CLIENT_SECRET: optionalSecret,
  SHOPIFY_API_VERSION: z.string().trim().default("2026-07"),
  AIRTABLE_ACCESS_TOKEN: optionalSecret,
  AIRTABLE_BASE_ID: optionalSecret,
  AIRTABLE_TABLE_ID: optionalSecret,
  AIRTABLE_ORDER_FIELD: z.string().default("Shopify Order"),
  AIRTABLE_PENDING_TABLE_ID: optionalSecret,
  AIRTABLE_WTB_TABLE_ID: optionalSecret,
  AIRTABLE_PENDING_ORDER_FIELD: z.string().default("Shopify Order"),
  AIRTABLE_WTB_ORDER_FIELD: z.string().default("Shopify Order"),
  AIRTABLE_STATUS_FIELD: z.string().default("Status"),
  AIRTABLE_UPDATED_FIELD: z.string().default("Last Update"),
  AIRTABLE_TRACKING_FIELD: z.string().default("Tracking"),
  SLACK_WEBHOOK_URL: optionalSecret
});

export type Config = z.infer<typeof schema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(environment);
}

export function integrationState(config: Config) {
  return {
    meta: Boolean(
      config.META_VERIFY_TOKEN &&
        config.META_APP_SECRET &&
        config.META_ACCESS_TOKEN &&
        config.META_PHONE_NUMBER_ID &&
        config.META_GRAPH_VERSION
    ),
    shopify: Boolean(
      config.SHOPIFY_STORE_DOMAIN &&
        (config.SHOPIFY_ADMIN_ACCESS_TOKEN || (config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET))
    ),
    airtable: Boolean(
      config.AIRTABLE_ACCESS_TOKEN &&
        config.AIRTABLE_BASE_ID &&
        (config.AIRTABLE_TABLE_ID ||
          (config.AIRTABLE_PENDING_TABLE_ID && config.AIRTABLE_WTB_TABLE_ID))
    ),
    slack: Boolean(config.SLACK_WEBHOOK_URL)
  };
}
