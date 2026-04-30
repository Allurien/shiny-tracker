import type { ScrapedPainting } from "../types/painting";

export interface ProductScraper {
  /** Returns true if this scraper handles the given URL. */
  handles(url: string): boolean;
  /** Fetch and parse a single product page. */
  fetchProduct(url: string): Promise<ScrapedPainting>;
}

export interface WishlistScraper {
  /** Returns true if this URL is a wishlist this scraper handles. */
  handlesWishlist(url: string): boolean;
  /**
   * Returns the product URLs found on a wishlist page.
   * Wishlists that need JS rendering (e.g. Swym) return null here and
   * the UI falls back to a hidden WebView flow.
   */
  fetchWishlistProductUrls(url: string): Promise<string[]> | null;
}
