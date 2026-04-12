require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const CHECK_URL =
  process.env.CHECK_URL ||
  "https://www.diamondartclub.com/collections/diamond-painting-restocks";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory set of product titles we've already seen
const knownProducts = new Set();

// ---------------------------------------------------------------------------
// Subscriber persistence (JSON file)
// ---------------------------------------------------------------------------
const SUBSCRIBERS_FILE = path.join(__dirname, "subscribers.json");

function loadSubscribers() {
  try {
    const data = fs.readFileSync(SUBSCRIBERS_FILE, "utf-8");
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

function saveSubscribers() {
  fs.writeFileSync(
    SUBSCRIBERS_FILE,
    JSON.stringify([...subscribers]),
    "utf-8"
  );
}

// Set of Discord user IDs who want DM alerts
const subscribers = loadSubscribers();

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------

/**
 * Fetch the restock page and return an array of product objects.
 * Each object has: { title, url, image, price }
 */
async function fetchProducts() {
  const { data: html } = await axios.get(CHECK_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(html);
  const products = [];

  $(".product-card").each((_i, el) => {
    const card = $(el);

    const titleEl = card.find(
      ".product-card-container-content-title a, .product-card-container-content-title"
    );
    const title = titleEl.text().trim();

    // Try to grab the link from the title anchor or the image wrapper
    let url =
      titleEl.closest("a").attr("href") ||
      card.find("a").first().attr("href") ||
      "";
    if (url && !url.startsWith("http")) {
      url = `https://www.diamondartclub.com${url}`;
    }

    const image =
      card.find("img").attr("src") || card.find("img").attr("data-src") || "";

    const price =
      card.find(".product-card-container-content-footer").text().trim() || "";

    if (title) {
      products.push({ title, url, image, price });
    }
  });

  return products;
}

// ---------------------------------------------------------------------------
// Discord helpers
// ---------------------------------------------------------------------------

function buildEmbed(product) {
  const embed = new EmbedBuilder()
    .setTitle(product.title)
    .setColor(0xe91e8c) // pink/magenta to match DAC branding
    .setTimestamp();

  if (product.url) embed.setURL(product.url);
  if (product.image) embed.setThumbnail(product.image);
  if (product.price) embed.addFields({ name: "Price", value: product.price });

  return embed;
}

async function notifySubscribers(embeds, count) {
  for (const userId of subscribers) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({
        content: `🔔 **New Restock Alert!** (${count} new item${count > 1 ? "s" : ""})`,
        embeds,
      });
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Could not DM user ${userId}: ${err.message}`
      );
      // If their DMs are closed, don't remove them — they may re-enable later
    }
  }
}

// ---------------------------------------------------------------------------
// Main check loop
// ---------------------------------------------------------------------------

async function checkForNewProducts(channel) {
  try {
    const products = await fetchProducts();

    if (products.length === 0) {
      console.log(`[${new Date().toISOString()}] No products found on page — the page structure may have changed.`);
      return;
    }

    // First run — seed the known set without notifying
    if (knownProducts.size === 0) {
      for (const p of products) {
        knownProducts.add(p.title);
      }
      console.log(
        `[${new Date().toISOString()}] Initial scan complete — tracking ${knownProducts.size} products.`
      );
      return;
    }

    // Find products we haven't seen before
    const newProducts = products.filter((p) => !knownProducts.has(p.title));

    if (newProducts.length > 0) {
      console.log(
        `[${new Date().toISOString()}] Found ${newProducts.length} new product(s)!`
      );

      const embeds = [];
      for (const product of newProducts) {
        knownProducts.add(product.title);
        embeds.push(buildEmbed(product));
      }

      // Post to the channel
      await channel.send({
        content: `🔔 **New Restock Alert!** (${newProducts.length} new item${newProducts.length > 1 ? "s" : ""})`,
        embeds,
      });

      // DM each subscriber
      await notifySubscribers(embeds, newProducts.length);
    } else {
      console.log(
        `[${new Date().toISOString()}] No new products. Still tracking ${knownProducts.size}.`
      );
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error checking for products:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Slash command definition
// ---------------------------------------------------------------------------
const alertsCommand = new SlashCommandBuilder()
  .setName("shiny-alerts")
  .setDescription("Manage Diamond Art Club restock DM alerts")
  .addSubcommand((sub) =>
    sub.setName("subscribe").setDescription("Get DM alerts when new restocks are found")
  )
  .addSubcommand((sub) =>
    sub.setName("unsubscribe").setDescription("Stop receiving DM alerts")
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Check your alert subscription status")
  )
  .addSubcommand((sub) =>
    sub.setName("test").setDescription("Send a test alert to the channel and DM you to verify everything works")
  );

async function registerCommands(clientId) {
  const rest = new REST().setToken(DISCORD_TOKEN);
  // Guild-specific registration is instant; global can take up to an hour
  await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), {
    body: [alertsCommand.toJSON()],
  });
  console.log("Slash commands registered.");
}

// ---------------------------------------------------------------------------
// Interaction handler
// ---------------------------------------------------------------------------
async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "shiny-alerts") return;

  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === "subscribe") {
    if (subscribers.has(userId)) {
      await interaction.reply({ content: "You're already subscribed to restock alerts!", ephemeral: true });
      return;
    }
    subscribers.add(userId);
    saveSubscribers();
    await interaction.reply({ content: "You're now subscribed! You'll receive a DM whenever new restocks are detected.", ephemeral: true });
  } else if (sub === "unsubscribe") {
    if (!subscribers.has(userId)) {
      await interaction.reply({ content: "You're not currently subscribed.", ephemeral: true });
      return;
    }
    subscribers.delete(userId);
    saveSubscribers();
    await interaction.reply({ content: "You've been unsubscribed. You'll no longer receive DM alerts.", ephemeral: true });
  } else if (sub === "status") {
    const status = subscribers.has(userId) ? "subscribed" : "not subscribed";
    await interaction.reply({
      content: `You are currently **${status}**. There are ${subscribers.size} subscriber(s) total.`,
      ephemeral: true,
    });
  } else if (sub === "test") {
    await interaction.deferReply({ ephemeral: true });

    const testEmbed = new EmbedBuilder()
      .setTitle("Test Product — Sparkle Diamond Kit")
      .setColor(0xe91e8c)
      .setURL(CHECK_URL)
      .addFields({ name: "Price", value: "$XX.XX" })
      .setFooter({ text: "This is a test alert" })
      .setTimestamp();

    // Test channel notification
    const channel = await client.channels.fetch(CHANNEL_ID);
    let channelOk = false;
    try {
      await channel.send({
        content: `🧪 **Test Restock Alert** (triggered by <@${userId}>)`,
        embeds: [testEmbed],
      });
      channelOk = true;
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Test channel send failed:`, err.message, err.code);
      // Log what permissions the bot actually has in that channel
      const botMember = await channel.guild.members.fetch(client.user.id);
      const perms = channel.permissionsFor(botMember);
      console.error(`  ViewChannel=${perms.has("ViewChannel")} SendMessages=${perms.has("SendMessages")} EmbedLinks=${perms.has("EmbedLinks")}`);
      console.error(`  Bot roles: ${botMember.roles.cache.map((r) => r.name).join(", ")}`);
    }

    // Test DM to the user who ran the command
    let dmOk = false;
    try {
      const user = await client.users.fetch(userId);
      await user.send({
        content: `🧪 **Test Restock Alert** — if you see this, DM notifications are working!`,
        embeds: [testEmbed],
      });
      dmOk = true;
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Test DM failed:`, err.message);
    }

    const results = [
      `Channel alert: ${channelOk ? "✅ sent" : "❌ failed — check bot permissions"}`,
      `DM alert: ${dmOk ? "✅ sent — check your DMs" : "❌ failed — make sure your DMs are open"}`,
    ];
    await interaction.editReply({ content: results.join("\n") });
  }
}

// ---------------------------------------------------------------------------
// Bot startup
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.on("interactionCreate", handleInteraction);

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands(client.user.id);

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel) {
    console.error(`Could not find channel with ID ${CHANNEL_ID}. Exiting.`);
    process.exit(1);
  }

  console.log(`Monitoring: ${CHECK_URL}`);
  console.log(`Posting to: #${channel.name} (${CHANNEL_ID})`);
  console.log(`Check interval: ${CHECK_INTERVAL_MS / 1000}s`);
  console.log(`Active subscribers: ${subscribers.size}`);

  // Permission diagnostics
  const botMember = await channel.guild.members.fetch(client.user.id);
  const perms = channel.permissionsFor(botMember);
  console.log("--- Channel permission check ---");
  console.log(`  View Channel:   ${perms.has("ViewChannel")}`);
  console.log(`  Send Messages:  ${perms.has("SendMessages")}`);
  console.log(`  Embed Links:    ${perms.has("EmbedLinks")}`);
  console.log(`  Bot roles:      ${botMember.roles.cache.map((r) => r.name).join(", ")}`);

  // Run immediately on startup, then every 5 minutes
  await checkForNewProducts(channel);
  setInterval(() => checkForNewProducts(channel), CHECK_INTERVAL_MS);
});

client.login(DISCORD_TOKEN);
