const db = require("../lib/db");
const { fetchProducts } = require("../lib/scraper");
const discord = require("../lib/discord");

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// ---------------------------------------------------------------------------
// Scheduled check — triggered by CloudWatch Events every 5 minutes
// ---------------------------------------------------------------------------
exports.handler = async () => {
  const products = await fetchProducts();

  if (products.length === 0) {
    console.log("No products found on page — the page structure may have changed.");
    return;
  }

  const knownProducts = await db.getKnownProducts();
  const currentTitles = new Set(products.map((p) => p.title));

  // Products that were on the page before but are no longer there (sold out / rotated out).
  // Removing them lets the bot re-alert if the same item restocks later.
  const removedTitles = [...knownProducts].filter((t) => !currentTitles.has(t));
  if (removedTitles.length > 0) {
    await db.removeProducts(removedTitles);
    console.log(`Removed ${removedTitles.length} product(s) no longer on page.`);
  }

  // First run — seed products without alerting
  if (knownProducts.size === 0) {
    await db.addProducts(products.map((p) => p.title));
    console.log(`Initial scan complete — seeded ${products.length} products.`);
    return;
  }

  const newProducts = products.filter((p) => !knownProducts.has(p.title));

  if (newProducts.length === 0) {
    console.log(`No new products. Tracking ${knownProducts.size - removedTitles.length}.`);
    return;
  }

  console.log(`Found ${newProducts.length} new product(s)!`);
  await db.addProducts(newProducts.map((p) => p.title));

  // Post to channel — caps embeds at 20 and lists overflow items as text.
  await discord.sendRestockAlert(
    (content, embeds) => discord.sendChannelMessage(CHANNEL_ID, content, embeds),
    newProducts
  );

  // DM subscribers + check each subscriber's wishlists for matches
  const subscriberIds = await db.getSubscribers();
  await notifySubscribersWithWishlistMatches(subscriberIds, newProducts);
};

// ---------------------------------------------------------------------------
// Wishlist matching (runs only on new restock detection)
// ---------------------------------------------------------------------------
async function notifySubscribersWithWishlistMatches(subscriberIds, newProducts) {
  const wishlistLib = require("../lib/wishlist");

  // Determine if anyone has wishlists at all — if not, skip browser entirely
  const subscriberWishlists = [];
  for (const userId of subscriberIds) {
    const wishlists = await db.getWishlistsForUser(userId);
    subscriberWishlists.push({ userId, wishlists });
  }
  const anyWishlists = subscriberWishlists.some((s) => s.wishlists.length > 0);

  let browser;
  if (anyWishlists) {
    try {
      browser = await wishlistLib.createBrowser();
    } catch (err) {
      console.error("Failed to launch headless browser:", err.message);
    }
  }

  try {
    for (const { userId, wishlists } of subscriberWishlists) {
      // Always send the base restock DM — same cap/overflow behavior as the channel post.
      try {
        await discord.sendRestockAlert(
          (content, embeds) => discord.sendDM(userId, content, embeds),
          newProducts
        );
      } catch (err) {
        console.error(`Could not DM user ${userId}: ${err.message}`);
      }

      if (!browser || wishlists.length === 0) continue;

      // Re-scrape each wishlist live so new additions are picked up
      const matchesByList = [];
      for (const wishlist of wishlists) {
        try {
          const { titles, name: scrapedName } = await wishlistLib.fetchWishlist(
            browser,
            wishlist.url
          );
          const normalizedWishlistTitles = new Set(
            titles.map(wishlistLib.normalizeTitle)
          );
          const matches = newProducts.filter((p) =>
            normalizedWishlistTitles.has(wishlistLib.normalizeTitle(p.title))
          );
          if (matches.length > 0) {
            matchesByList.push({
              wishlistName: scrapedName || wishlist.name,
              wishlistUrl: wishlist.url,
              matches,
            });
          }
        } catch (err) {
          console.error(
            `Failed to fetch wishlist ${wishlist.url}: ${err.message}`
          );
        }
      }

      if (matchesByList.length > 0) {
        const lines = [
          `\u{1F48E} **Wishlist Match!** Some items from this restock are on your wishlist${matchesByList.length > 1 ? "s" : ""}:`,
          "",
        ];
        for (const { wishlistName, wishlistUrl, matches } of matchesByList) {
          lines.push(`**${wishlistName}** — <${wishlistUrl}>`);
          for (const m of matches) {
            lines.push(`\u2022 ${m.title}`);
          }
          lines.push("");
        }
        const matchEmbeds = matchesByList.flatMap((m) =>
          m.matches.map((p) => discord.buildEmbed(p))
        );
        try {
          await discord.sendDM(userId, lines.join("\n"), matchEmbeds);
        } catch (err) {
          console.error(
            `Could not send wishlist match DM to ${userId}: ${err.message}`
          );
        }
      }
    }
  } finally {
    if (browser) {
      await wishlistLib.closeBrowser(browser);
    }
  }
}
