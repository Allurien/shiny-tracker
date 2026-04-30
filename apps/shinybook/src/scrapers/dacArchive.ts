// Discovery feed for the Diamond Art Club "Archived Kits" collection. The
// site itself doesn't expose search on this collection, so we list everything
// here and let the user search/filter locally.
//
// Pulls /collections/archived-kits/products.json — the public Shopify
// endpoint. Paginated 250 at a time; stops when a page returns fewer than
// the requested limit.
//
// Module-level cache so navigating away and back is instant. Pass
// `force: true` to bust the cache for an explicit refresh.

import type { DrillShape } from "../types/painting";

const COLLECTION_URL =
  "https://www.diamondartclub.com/collections/archived-kits/products.json";
const PAGE_LIMIT = 250;
const PRODUCT_BASE_URL = "https://www.diamondartclub.com/products/";

export interface ArchivedKit {
  id: number;
  handle: string;
  title: string;
  vendor?: string;          // DAC sets this to "By {Artist}" most of the time
  artist?: string;          // Cleaned vendor (no "By " prefix)
  productUrl: string;       // Canonical /products/{handle} URL
  coverImage?: string;
  price?: number;
  currency?: string;
  publishedAt?: string;
  drillShape?: DrillShape;
}

interface ShopifyListProduct {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  product_type?: string;
  published_at?: string;
  images?: Array<{ src: string }>;
  variants?: Array<{ price: string }>;
  options?: Array<{ name?: string; values?: string[] }>;
  // Shopify serves `tags` as an array in /collections/*/products.json but as
  // a comma-joined string in /products/*.json — handle both.
  tags?: string[] | string;
}

let cache: { items: ArchivedKit[]; fetchedAt: number } | null = null;

export function cachedArchivedKits(): ArchivedKit[] | null {
  return cache?.items ?? null;
}

export interface FetchProgress {
  page: number;
  itemsSoFar: number;
}

export async function fetchArchivedKits(opts: {
  force?: boolean;
  onProgress?: (p: FetchProgress) => void;
} = {}): Promise<ArchivedKit[]> {
  if (!opts.force && cache) return cache.items;

  const items: ArchivedKit[] = [];
  for (let page = 1; page < 50; page++) {
    const url = `${COLLECTION_URL}?limit=${PAGE_LIMIT}&page=${page}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Archived-kits fetch failed (page ${page}): ${res.status}`);
    }
    const body = (await res.json()) as { products?: ShopifyListProduct[] };
    const products = body.products ?? [];
    for (const p of products) items.push(toKit(p));
    opts.onProgress?.({ page, itemsSoFar: items.length });
    if (products.length < PAGE_LIMIT) break;
  }

  cache = { items, fetchedAt: Date.now() };
  return items;
}

function toKit(p: ShopifyListProduct): ArchivedKit {
  const vendor = p.vendor?.trim() || undefined;
  const artist = vendor?.replace(/^By\s+/i, "").trim() || undefined;
  const price = p.variants?.[0]?.price;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    vendor,
    artist,
    productUrl: `${PRODUCT_BASE_URL}${p.handle}`,
    coverImage: p.images?.[0]?.src,
    price: price ? Number(price) : undefined,
    currency: price ? "USD" : undefined,
    publishedAt: p.published_at,
    drillShape: parseDrillShape(p),
  };
}

// Mirrors the product-page scraper: prefer the "Diamonds" option, fall back
// to the tag set that DAC applies ("round-shape" / "square-shape").
function parseDrillShape(p: ShopifyListProduct): DrillShape | undefined {
  const diamonds = p.options
    ?.find((o) => o.name?.toLowerCase() === "diamonds")
    ?.values?.[0]
    ?.toLowerCase() ?? "";
  if (diamonds.startsWith("square")) return "square";
  if (diamonds.startsWith("round")) return "round";

  const tags = Array.isArray(p.tags)
    ? p.tags.map((t) => t.toLowerCase())
    : (p.tags ?? "").toLowerCase().split(",").map((t) => t.trim());
  if (tags.includes("square-shape")) return "square";
  if (tags.includes("round-shape")) return "round";
  if (tags.includes("specialty")) return "specialty";
  return undefined;
}

// Case-insensitive substring match across the searchable fields.
export function matchesArchivedQuery(kit: ArchivedKit, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [kit.title, kit.artist, kit.vendor]
    .filter((s): s is string => !!s)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}
