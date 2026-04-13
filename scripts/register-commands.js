#!/usr/bin/env node

// One-time script to register the /shiny-alerts slash command with Discord.
// Run after deploying:  npm run register

require("dotenv").config();
const axios = require("axios");

const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.DISCORD_APP_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // optional — omit for global registration

const command = {
  name: "shiny-alerts",
  description: "Manage Diamond Art Club restock DM alerts",
  options: [
    {
      type: 1,
      name: "subscribe",
      description: "Get DM alerts when new restocks are found",
    },
    {
      type: 1,
      name: "unsubscribe",
      description: "Stop receiving DM alerts",
    },
    {
      type: 1,
      name: "status",
      description: "Check your alert subscription status",
    },
    {
      type: 1,
      name: "test",
      description:
        "Send a test alert to the channel and DM you to verify everything works",
    },
  ],
};

async function register() {
  const url = GUILD_ID
    ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
    : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

  const { data } = await axios.put(url, [command], {
    headers: { Authorization: `Bot ${TOKEN}` },
  });

  console.log(
    `Registered ${data.length} command(s)${GUILD_ID ? ` to guild ${GUILD_ID}` : " globally"}.`
  );
}

register().catch((err) => {
  console.error("Failed to register commands:", err.response?.data || err.message);
  process.exit(1);
});
