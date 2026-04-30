const db = require("../lib/db");
const discord = require("../lib/discord");

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const CHECK_URL =
  "https://www.diamondartclub.com/collections/diamond-painting-restocks";

// Inlined so this handler doesn't import lib/wishlist.js (which pulls puppeteer
// into the esbuild graph even though it's lazy-required at runtime).
function extractLid(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("lid") || "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Interaction handler — triggered by API Gateway (Discord Interactions Endpoint)
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
  const signature = event.headers["x-signature-ed25519"];
  const timestamp = event.headers["x-signature-timestamp"];
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf-8")
    : event.body;

  if (!discord.verifySignature(rawBody, signature, timestamp, PUBLIC_KEY)) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  const interaction = JSON.parse(rawBody);

  // Discord PING — required for Interactions Endpoint verification
  if (interaction.type === 1) {
    return jsonResponse({ type: 1 });
  }

  // Slash command
  if (interaction.type === 2 && interaction.data.name === "shiny-alerts") {
    const subOption = interaction.data.options[0];
    const sub = subOption.name;
    const subArgs = {};
    for (const opt of subOption.options || []) {
      subArgs[opt.name] = opt.value;
    }
    const userId = interaction.member?.user?.id || interaction.user?.id;
    return handleAlertCommand(sub, userId, subArgs);
  }

  return { statusCode: 400, body: "Unknown interaction" };
};

async function handleAlertCommand(sub, userId, args = {}) {
  if (sub === "subscribe") {
    if (await db.isSubscribed(userId)) {
      return ephemeral("You're already subscribed to restock alerts!");
    }
    await db.addSubscriber(userId);
    return ephemeral(
      "You're now subscribed! You'll receive a DM whenever new restocks are detected."
    );
  }

  if (sub === "unsubscribe") {
    if (!(await db.isSubscribed(userId))) {
      return ephemeral("You're not currently subscribed.");
    }
    await db.removeSubscriber(userId);

    // Also clean up any tracked wishlists so they don't linger in the DB.
    const wishlists = await db.getWishlistsForUser(userId);
    for (const w of wishlists) {
      await db.removeWishlist(userId, w.lid);
    }

    const wishlistNote =
      wishlists.length > 0
        ? ` Your ${wishlists.length} tracked wishlist${wishlists.length > 1 ? "s were" : " was"} also removed.`
        : "";
    return ephemeral(
      `You've been unsubscribed. You'll no longer receive DM alerts.${wishlistNote}`
    );
  }

  if (sub === "status") {
    const subscribed = await db.isSubscribed(userId);
    const count = await db.getSubscriberCount();
    const status = subscribed ? "subscribed" : "not subscribed";
    return ephemeral(
      `You are currently **${status}**. There are ${count} subscriber(s) total.`
    );
  }

  if (sub === "test") {
    const testEmbed = {
      title: "Test Product \u2014 Sparkle Diamond Kit",
      color: 0xe91e8c,
      url: CHECK_URL,
      fields: [{ name: "Price", value: "$XX.XX" }],
      footer: { text: "This is a test alert" },
      timestamp: new Date().toISOString(),
    };

    let channelOk = false;
    let dmOk = false;

    try {
      await discord.sendChannelMessage(
        CHANNEL_ID,
        `\u{1F9EA} **Test Restock Alert** (triggered by <@${userId}>)`,
        [testEmbed]
      );
      channelOk = true;
    } catch (err) {
      console.error("Test channel send failed:", err.message);
    }

    try {
      await discord.sendDM(
        userId,
        "\u{1F9EA} **Test Restock Alert** \u2014 if you see this, DM notifications are working!",
        [testEmbed]
      );
      dmOk = true;
    } catch (err) {
      console.error("Test DM failed:", err.message);
    }

    const results = [
      `Channel alert: ${channelOk ? "\u2705 sent" : "\u274C failed \u2014 check bot permissions"}`,
      `DM alert: ${dmOk ? "\u2705 sent \u2014 check your DMs" : "\u274C failed \u2014 make sure your DMs are open"}`,
    ];
    return ephemeral(results.join("\n"));
  }

  if (sub === "wishlist-add") {
    const url = (args.url || "").trim();
    const lid = extractLid(url);
    if (!lid) {
      return ephemeral(
        "Invalid wishlist URL \u2014 make sure it contains a `lid=...` parameter."
      );
    }
    await db.addWishlist(userId, lid, url, "");
    let autoSubscribed = false;
    if (!(await db.isSubscribed(userId))) {
      await db.addSubscriber(userId);
      autoSubscribed = true;
    }
    const lines = [
      `\u2705 Wishlist added (id: \`${lid.slice(0, 8)}\`).`,
      autoSubscribed
        ? "You've also been subscribed to restock alerts."
        : "You're already subscribed to restock alerts.",
      "When a restock is detected, you'll get a separate DM for any items on this wishlist.",
    ];
    return ephemeral(lines.join("\n"));
  }

  if (sub === "wishlist-remove") {
    const url = (args.url || "").trim();
    const lid = extractLid(url);
    if (!lid) {
      return ephemeral(
        "Invalid wishlist URL \u2014 paste the same URL you used when adding it."
      );
    }
    await db.removeWishlist(userId, lid);
    return ephemeral(`\u2705 Wishlist \`${lid.slice(0, 8)}\` removed.`);
  }

  if (sub === "wishlists") {
    const wishlists = await db.getWishlistsForUser(userId);
    if (wishlists.length === 0) {
      return ephemeral(
        "You have no wishlists tracked. Add one with `/shiny-alerts wishlist-add url:<your-wishlist-url>`."
      );
    }
    const lines = [
      `You are tracking **${wishlists.length}** wishlist${wishlists.length > 1 ? "s" : ""}:`,
      ...wishlists.map(
        (w, i) => `${i + 1}. **${w.name}** \u2014 <${w.url}>`
      ),
    ];
    return ephemeral(lines.join("\n"));
  }

  return ephemeral("Unknown subcommand.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonResponse(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function ephemeral(content) {
  return jsonResponse({
    type: 4,
    data: { content, flags: 64 },
  });
}
