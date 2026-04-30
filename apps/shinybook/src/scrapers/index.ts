// Scraper registry. Add new brand modules here.

import { amazonProductScraper } from "./amazon";
import {
  diamondArtClubProductScraper,
  diamondArtClubWishlistScraper,
} from "./diamondArtClub";
import { oraloaProductScraper } from "./oraloa";
import type { ProductScraper, WishlistScraper } from "./types";
import type { ScrapedPainting } from "../types/painting";

const PRODUCT_SCRAPERS: ProductScraper[] = [
  diamondArtClubProductScraper,
  oraloaProductScraper,
  amazonProductScraper,
];
const WISHLIST_SCRAPERS: WishlistScraper[] = [diamondArtClubWishlistScraper];

export function findProductScraper(url: string): ProductScraper | null {
  return PRODUCT_SCRAPERS.find((s) => s.handles(url)) ?? null;
}

export function findWishlistScraper(url: string): WishlistScraper | null {
  return WISHLIST_SCRAPERS.find((s) => s.handlesWishlist(url)) ?? null;
}

export async function scrapeProduct(url: string): Promise<ScrapedPainting> {
  const scraper = findProductScraper(url);
  if (!scraper) {
    throw new Error(
      `No scraper supports this URL yet. You can still add the painting manually.`
    );
  }
  return scraper.fetchProduct(url);
}
