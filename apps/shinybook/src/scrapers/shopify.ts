// Generic Shopify product scraper. Works against /products/{handle}.json —
// an endpoint every Shopify storefront exposes publicly. Brand-specific
// scrapers (e.g. Diamond Art Club) wrap this to add store-specific parsing.

import type { ScrapedPainting } from "../types/painting";

export interface ShopifyProduct {
  title: string;
  vendor: string;
  product_type: string;
  handle: string;
  tags: string; // comma-separated
  body_html: string;
  images: Array<{ src: string }>;
  options: Array<{ name: string; values: string[] }>;
  variants: Array<{ price: string; compare_at_price?: string; sku?: string }>;
}

export interface ParsedProductUrl {
  origin: string;
  // Path before /products/ — empty for unprefixed stores, "/en" for locale-prefixed.
  pathPrefix: string;
  handle: string;
}

export function parseProductUrl(url: string): ParsedProductUrl | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^(.*?)\/products\/([^/?#]+)/);
    if (!m) return null;
    return {
      origin: `${u.protocol}//${u.host}`,
      pathPrefix: m[1],
      handle: m[2],
    };
  } catch {
    return null;
  }
}

export async function fetchShopifyProduct(url: string): Promise<ShopifyProduct> {
  const parsed = parseProductUrl(url);
  if (!parsed) throw new Error(`Not a recognizable Shopify product URL: ${url}`);
  const jsonUrl = `${parsed.origin}${parsed.pathPrefix}/products/${parsed.handle}.json`;
  const res = await fetch(jsonUrl, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Product fetch failed: ${res.status}`);
  const body = (await res.json()) as { product?: ShopifyProduct };
  if (!body.product) throw new Error("Response did not contain a product");
  return body.product;
}

// Strip HTML tags + collapse whitespace for the description field.
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Baseline mapping — sets every field a generic Shopify store can supply.
// Brand-specific scrapers override/extend this.
export function baseScrapedPainting(p: ShopifyProduct, sourceUrl: string): ScrapedPainting {
  const price = p.variants?.[0]?.price;
  return {
    title: p.title,
    brand: p.vendor || undefined,
    sourceUrl,
    coverImage: p.images?.[0]?.src,
    description: stripHtml(p.body_html || ""),
    price: price ? Number(price) : undefined,
    currency: "USD",
    tags: p.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
  };
}
