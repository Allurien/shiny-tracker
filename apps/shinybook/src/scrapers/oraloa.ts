// Oraloa product scraping. Oraloa is a locale-prefixed Shopify store
// (/en/products/…), so we lean on the generic Shopify fetcher and layer
// brand/artist + spec parsing on top. Titles typically follow the pattern
// "Artwork Name by Artist Name", so we split on " by " to pull the artist.

import type { ScrapedPainting, DrillShape } from "../types/painting";
import type { ProductScraper } from "./types";
import {
  baseScrapedPainting,
  fetchShopifyProduct,
  parseProductUrl,
  type ShopifyProduct,
} from "./shopify";

const HOST = "oraloa.com";

function isOraloaUrl(url: string): boolean {
  try {
    const host = new URL(url).host.replace(/^www\./, "");
    return host === HOST;
  } catch {
    return false;
  }
}

function splitTitleAndArtist(raw: string): { title: string; artist?: string } {
  // Case-insensitive " by " separator, keep everything before as the title.
  const m = raw.match(/^(.*?)\s+by\s+(.+)$/i);
  if (!m) return { title: raw.trim() };
  return { title: m[1].trim(), artist: m[2].trim() };
}

function getOption(p: ShopifyProduct, name: string): string | undefined {
  const opt = p.options?.find((o) => o.name?.toLowerCase() === name.toLowerCase());
  return opt?.values?.[0];
}

function parseDrillShape(p: ShopifyProduct): DrillShape | undefined {
  const candidates = [
    getOption(p, "Drill Shape"),
    getOption(p, "Drill Type"),
    getOption(p, "Drills"),
    getOption(p, "Shape"),
  ];
  for (const c of candidates) {
    const v = c?.toLowerCase();
    if (!v) continue;
    if (v.startsWith("square")) return "square";
    if (v.startsWith("round")) return "round";
    if (v.includes("specialty")) return "specialty";
  }
  const tags = (p.tags || "").toLowerCase();
  if (tags.includes("square")) return "square";
  if (tags.includes("round")) return "round";
  return undefined;
}

function parseCanvasSize(p: ShopifyProduct): string | undefined {
  return (
    getOption(p, "Size") ??
    getOption(p, "Canvas Size") ??
    getOption(p, "Dimensions")
  );
}

export const oraloaProductScraper: ProductScraper = {
  handles(url: string) {
    return isOraloaUrl(url) && !!parseProductUrl(url);
  },
  async fetchProduct(url: string): Promise<ScrapedPainting> {
    const p = await fetchShopifyProduct(url);
    const base = baseScrapedPainting(p, url);
    const { title, artist } = splitTitleAndArtist(p.title);
    return {
      ...base,
      title,
      brand: "Oraloa",
      artist: artist ?? base.brand,
      canvasSize: parseCanvasSize(p),
      drillShape: parseDrillShape(p),
    };
  },
};
