// Diamond Art Club product + wishlist scraping.
//
// Product side: extends the generic Shopify scraper with parsing for the
// option fields DAC consistently sets:
//   - "Full Drill Canvas Size" → canvasSize
//   - "Diamonds"               → drillShape + colorCount
//   - "Diamonds Count"         → drillCount
// Tags also include "round-shape" / "square-shape" as a fallback.
//
// Wishlist side: DAC uses Swym, which is JS-rendered. The only URL form
// that renders without a logged-in Swym session is the public share URL
// produced by DAC's "Share List" button — /pages/swym-share-wishlist?hkey=...
// Personal /pages/wishlist?lid=... URLs require the user's Swym cookies and
// can't be scraped from a fresh WebView. The scraper here matches the share
// form so the import UI can route to the WebView path.

import type { ScrapedPainting, DrillShape } from "../types/painting";
import type { ProductScraper, WishlistScraper } from "./types";
import {
  baseScrapedPainting,
  fetchShopifyProduct,
  parseProductUrl,
  type ShopifyProduct,
} from "./shopify";

const HOST = "www.diamondartclub.com";

function isDacUrl(url: string): boolean {
  try {
    return new URL(url).host === HOST;
  } catch {
    return false;
  }
}

function getOption(p: ShopifyProduct, name: string): string | undefined {
  const opt = p.options?.find((o) => o.name?.toLowerCase() === name.toLowerCase());
  return opt?.values?.[0];
}

function parseDrillShape(p: ShopifyProduct): DrillShape | undefined {
  const diamonds = getOption(p, "Diamonds")?.toLowerCase() ?? "";
  if (diamonds.startsWith("square")) return "square";
  if (diamonds.startsWith("round")) return "round";

  // Fallback to tags
  const tags = (p.tags || "").toLowerCase();
  if (tags.includes("square-shape")) return "square";
  if (tags.includes("round-shape")) return "round";
  if (tags.includes("specialty")) return "specialty";
  return undefined;
}

function parseColorCount(p: ShopifyProduct): number | undefined {
  const diamonds = getOption(p, "Diamonds") ?? "";
  // Examples: "Square with 69 Colors including 1 Iridescent Diamond..."
  const m = diamonds.match(/(\d+)\s*Colors?/i);
  return m ? parseInt(m[1], 10) : undefined;
}

function parseDrillCount(p: ShopifyProduct): number | undefined {
  const raw = getOption(p, "Diamonds Count");
  if (!raw) return undefined;
  const n = parseInt(raw.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

export const diamondArtClubProductScraper: ProductScraper = {
  handles(url: string) {
    return isDacUrl(url) && !!parseProductUrl(url);
  },
  async fetchProduct(url: string): Promise<ScrapedPainting> {
    const p = await fetchShopifyProduct(url);
    const base = baseScrapedPainting(p, url);
    return {
      ...base,
      brand: "Diamond Art Club",
      artist: p.vendor?.replace(/^By\s+/i, "").trim() || base.brand,
      canvasSize: getOption(p, "Full Drill Canvas Size"),
      drillShape: parseDrillShape(p),
      colorCount: parseColorCount(p),
      drillCount: parseDrillCount(p),
    };
  },
};

export const diamondArtClubWishlistScraper: WishlistScraper = {
  handlesWishlist(url: string) {
    if (!isDacUrl(url)) return false;
    try {
      const u = new URL(url);
      return (
        u.pathname.startsWith("/pages/swym-share-wishlist")
        && u.searchParams.has("hkey")
      );
    } catch {
      return false;
    }
  },
  // Swym is JS-rendered — the WebView flow handles this. Returning null
  // signals "no static fetch path; use WebView".
  fetchWishlistProductUrls() {
    return null;
  },
};
