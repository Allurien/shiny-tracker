const axios = require("axios");

const STORE_ORIGIN = "https://www.diamondartclub.com";
const COLLECTION_HANDLE =
  process.env.COLLECTION_HANDLE || "diamond-painting-restocks";

// Kept for backward-compatibility with any callers (e.g. the /test embed URL).
const CHECK_URL = `${STORE_ORIGIN}/collections/${COLLECTION_HANDLE}`;

// Shopify exposes a public JSON endpoint for every collection. Up to 250
// products per page, simple ?page=N pagination, no auth, no JS rendering.
// This sidesteps the "view more" issue entirely — we don't care how the
// storefront renders pagination, we query the raw collection.
const PAGE_SIZE = 250;
const MAX_PAGES = 20; // hard safety cap (5000 products); way more than expected

async function fetchProducts() {
  const products = [];
  const seenTitles = new Set(); // guard against accidental dupes across pages

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${STORE_ORIGIN}/collections/${COLLECTION_HANDLE}/products.json?limit=${PAGE_SIZE}&page=${page}`;
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    const batch = Array.isArray(data?.products) ? data.products : [];
    if (batch.length === 0) break;

    for (const p of batch) {
      const title = (p.title || "").trim();
      if (!title || seenTitles.has(title)) continue;
      seenTitles.add(title);

      const productUrl = p.handle ? `${STORE_ORIGIN}/products/${p.handle}` : "";
      const image =
        p.images?.[0]?.src ||
        p.image?.src ||
        "";
      const rawPrice = p.variants?.[0]?.price;
      const price =
        rawPrice !== undefined && rawPrice !== null && rawPrice !== ""
          ? `$${rawPrice}`
          : "";

      products.push({ title, url: productUrl, image, price });
    }

    // If the page came back short, we've reached the end.
    if (batch.length < PAGE_SIZE) break;
  }

  return products;
}

module.exports = { fetchProducts, CHECK_URL };
