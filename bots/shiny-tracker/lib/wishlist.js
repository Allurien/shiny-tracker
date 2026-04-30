// Scrapes a client-side rendered Swym wishlist page using headless Chromium.
// Used only during the scheduled restock check, so puppeteer is required lazily.

async function createBrowser() {
  const puppeteer = require("puppeteer-core");
  const chromium = require("@sparticuz/chromium");

  return await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

async function fetchWishlist(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

    // Wait for Swym's grid to render
    await page
      .waitForSelector(".GridItem, .product-card, [data-variant-id]", { timeout: 20000 })
      .catch(() => {});

    // Extra delay for Swym to populate product details
    await new Promise((r) => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
      const titles = new Set();

      // Grab titles from product card anchors linking to /products/
      const anchors = document.querySelectorAll('a[href*="/products/"]');
      for (const a of anchors) {
        const text = a.textContent.trim();
        // Skip empty anchors and ones that are just images or "View"-style buttons
        if (text && text.length > 2 && !/^(view|add to cart|quick view)$/i.test(text)) {
          titles.add(text);
        }
      }

      // Fallback: common Shopify product card selectors
      if (titles.size === 0) {
        const items = document.querySelectorAll(
          ".GridItem, .product-card, [data-product-variant-sku]"
        );
        for (const item of items) {
          const titleEl = item.querySelector(
            ".product-title, .product-card-container-content-title, .title, h2, h3"
          );
          if (titleEl) {
            const text = titleEl.textContent.trim();
            if (text) titles.add(text);
          }
        }
      }

      // Try to find the list name
      const nameEl =
        document.querySelector(".wishlist-title, .wishlist-name") ||
        document.querySelector("h1.page-title") ||
        document.querySelector("main h1");
      const name = nameEl ? nameEl.textContent.trim() : "";

      return {
        titles: [...titles],
        name,
      };
    });

    return result;
  } finally {
    await page.close();
  }
}

async function closeBrowser(browser) {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // ignore
    }
  }
}

function extractLid(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("lid") || "";
  } catch {
    return "";
  }
}

// Normalize title for case/whitespace-insensitive matching
function normalizeTitle(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

module.exports = {
  createBrowser,
  fetchWishlist,
  closeBrowser,
  extractLid,
  normalizeTitle,
};
