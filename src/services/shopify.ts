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
export interface ShopifyProductMatch {
  title: string;
  handle: string;
  score: number;
  variants: Array<{ title: string; sku?: string; availableForSale: boolean; inventoryQuantity: number }>;
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
  private productCache?: { value: ShopifyProductMatch[]; expiresAt: number };

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

  async findProductMatches(input: string): Promise<ShopifyProductMatch[]> {
    if (!this.productCache || this.productCache.expiresAt < Date.now()) {
      const query = `
        query ProductCatalogue($cursor: String) {
          products(first: 100, after: $cursor, sortKey: TITLE) {
            nodes {
              title
              handle
              variants(first: 100) {
                nodes { title sku availableForSale inventoryQuantity }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      type ProductNode = { title: string; handle: string; variants: { nodes: Array<{ title: string; sku?: string; availableForSale: boolean; inventoryQuantity: number }> } };
      const catalogue: ProductNode[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page++) {
        const data = await this.graphql<{ products: { nodes: ProductNode[]; pageInfo: { hasNextPage: boolean; endCursor?: string } } }>(query, { cursor });
        catalogue.push(...data.products.nodes);
        if (!data.products.pageInfo.hasNextPage || !data.products.pageInfo.endCursor) break;
        cursor = data.products.pageInfo.endCursor;
      }
      this.productCache = {
        value: catalogue.map((product) => ({ title: product.title, handle: product.handle, score: 0, variants: product.variants.nodes })),
        expiresAt: Date.now() + 5 * 60_000
      };
    }
    const wanted = searchTokens(input);
    if (!wanted.length) return [];
    return this.productCache.value
      .map((product) => {
        const source = `${product.title} ${product.handle} ${product.variants.map((variant) => variant.sku ?? "").join(" ")}`;
        const haystack = new Set(searchTokens(source));
        const compact = source.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
        const matches = wanted.filter((token) => compact.includes(token) || [...haystack].some((candidate) =>
          candidate.includes(token) || token.includes(candidate) ||
          (candidate.length >= 5 && token.length >= 5 && candidate.slice(0, 4) === token.slice(0, 4))
        ));
        return { ...product, score: matches.length / wanted.length };
      })
      .filter((product) => product.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}

const SEARCH_STOP_WORDS = new Set(["a", "o", "os", "as", "um", "uma", "de", "do", "da", "e", "em", "tem", "têm", "este", "esta", "artigo", "produto", "disponivel", "disponível", "stock", "quero", "preciso", "para", "the", "is", "this", "in", "available", "quiero", "necesito", "disponible"]);
function searchTokens(value: string): string[] {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ").split(/\s+/)
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token));
}

export function customerMatchesOrder(order: ShopifyOrder, suppliedIdentity: string, _whatsappId?: string): boolean {
  const identity = suppliedIdentity.trim().toLowerCase();
  return identity.includes("@") && order.email?.trim().toLowerCase() === identity;
}
