const db = require("./lib/db");
const { fetchProducts, CHECK_URL } = require("./lib/scraper");
const discord = require("./lib/discord");

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

// ---------------------------------------------------------------------------
// Scheduled check — triggered by CloudWatch Events every 5 minutes
// ---------------------------------------------------------------------------
exports.scheduledCheck = async () => {
  const products = await fetchProducts();

  if (products.length === 0) {
    console.log("No products found on page — the page structure may have changed.");
    return;
  }

  const knownProducts = await db.getKnownProducts();

  // First run — seed products without alerting
  if (knownProducts.size === 0) {
    await db.addProducts(products.map((p) => p.title));
    console.log(`Initial scan complete — seeded ${products.length} products.`);
    return;
  }

  const newProducts = products.filter((p) => !knownProducts.has(p.title));

  if (newProducts.length === 0) {
    console.log(`No new products. Tracking ${knownProducts.size}.`);
    return;
  }

  console.log(`Found ${newProducts.length} new product(s)!`);
  await db.addProducts(newProducts.map((p) => p.title));

  const embeds = newProducts.map((p) => discord.buildEmbed(p));
  const content = `\u{1F514} **New Restock Alert!** (${newProducts.length} new item${newProducts.length > 1 ? "s" : ""})`;

  // Post to channel
  await discord.sendChannelMessage(CHANNEL_ID, content, embeds);

  // DM subscribers
  const subscriberIds = await db.getSubscribers();
  for (const userId of subscriberIds) {
    try {
      await discord.sendDM(userId, content, embeds);
    } catch (err) {
      console.error(`Could not DM user ${userId}: ${err.message}`);
    }
  }
};

// ---------------------------------------------------------------------------
// Interaction handler — triggered by API Gateway (Discord Interactions Endpoint)
// ---------------------------------------------------------------------------
exports.interactionHandler = async (event) => {
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
    const sub = interaction.data.options[0].name;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    return handleAlertCommand(sub, userId);
  }

  return { statusCode: 400, body: "Unknown interaction" };
};

async function handleAlertCommand(sub, userId) {
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
    return ephemeral(
      "You've been unsubscribed. You'll no longer receive DM alerts."
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
