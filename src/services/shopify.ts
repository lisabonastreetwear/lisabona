import type { Config } from "../config.js";

export interface ShopifyOrder {
  name: string;
  email?: string;
  phone?: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

interface ShopifyResponse {
  data?: {
    orders?: {
      nodes?: Array<{
        name: string;
        email?: string;
        phone?: string;
        displayFinancialStatus?: string;
        displayFulfillmentStatus?: string;
        fulfillments?: Array<{
          trackingInfo?: Array<{ number?: string; url?: string }>;
        }>;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

export class ShopifyClient {
  private cachedToken?: { value: string; expiresAt: number };

  constructor(private readonly config: Config) {}

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const endpoint = `https://${this.config.SHOPIFY_STORE_DOMAIN}/admin/api/${this.config.SHOPIFY_API_VERSION}/graphql.json`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": await this.accessToken()
      },
      body: JSON.stringify({ query, variables })
    });
    const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (!response.ok || payload.errors?.length || !payload.data) {
      throw new Error(`Shopify API ${response.status}: ${JSON.stringify(payload.errors ?? "resposta inválida")}`);
    }
    return payload.data;
  }

  async testConnection(): Promise<string> {
    const data = await this.graphql<{ shop: { name: string } }>("query TestConnection { shop { name } }");
    return data.shop.name;
  }

  private async accessToken(): Promise<string> {
    if (this.config.SHOPIFY_ADMIN_ACCESS_TOKEN) return this.config.SHOPIFY_ADMIN_ACCESS_TOKEN;
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
      return this.cachedToken.value;
    }
    const response = await fetch(
      `https://${this.config.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.SHOPIFY_CLIENT_ID,
          client_secret: this.config.SHOPIFY_CLIENT_SECRET,
          grant_type: "client_credentials"
        })
      }
    );
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new Error(
        `Shopify OAuth ${response.status}: ${payload.error_description ?? payload.error ?? "resposta inválida"}`
      );
    }
    this.cachedToken = {
      value: payload.access_token,
      expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000
    };
    return this.cachedToken.value;
  }

  async findOrder(orderNumber: string): Promise<ShopifyOrder | null> {
    const normalized = orderNumber.replace(/^#/, "").trim();
    const query = `
      query FindOrder($search: String!) {
        orders(first: 1, query: $search) {
          nodes {
            name
            email
            phone
            displayFinancialStatus
            displayFulfillmentStatus
            fulfillments(first: 5) {
              trackingInfo { number url }
            }
          }
        }
      }
    `;
    const payload = await this.graphql<NonNullable<ShopifyResponse["data"]>>(query, {
      search: `name:#${normalized}`
    });
    const order = payload.orders?.nodes?.[0];
    if (!order) return null;
    const tracking = order.fulfillments?.flatMap((item) => item.trackingInfo ?? [])[0];
    return {
      name: order.name,
      email: order.email,
      phone: order.phone,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      trackingNumber: tracking?.number,
      trackingUrl: tracking?.url
    };
  }
}

export function customerMatchesOrder(order: ShopifyOrder, suppliedIdentity: string, whatsappId: string): boolean {
  const identity = suppliedIdentity.trim().toLowerCase();
  if (identity.includes("@")) return order.email?.trim().toLowerCase() === identity;
  const digits = identity.replace(/\D/g, "");
  if (digits.length < 7) return false;
  const orderPhone = order.phone?.replace(/\D/g, "") ?? "";
  const waPhone = whatsappId.replace(/\D/g, "");
  return Boolean(orderPhone && (orderPhone.endsWith(digits) || digits.endsWith(orderPhone))) || waPhone.endsWith(digits);
}
