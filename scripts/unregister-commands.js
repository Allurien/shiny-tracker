#!/usr/bin/env node

// Manage registered slash commands.
//   npm run unregister                          # clears ALL guild commands (or global if no GUILD_ID)
//   npm run unregister -- <cmd-id>              # deletes a single command by ID
//   npm run unregister -- --global              # force global scope (ignore GUILD_ID in .env)
//   npm run unregister -- --global <cmd-id>     # delete a single global command by ID
//   npm run unregister -- list                  # list commands in the target scope
//   npm run unregister -- --global list         # list global commands

require("dotenv").config();
const axios = require("axios");

const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.DISCORD_APP_ID;

// Parse args
const args = process.argv.slice(2);
const forceGlobal = args.includes("--global");
const positional = args.filter((a) => a !== "--global");
const action = positional[0]; // either "list", a command ID, or undefined

const GUILD_ID = forceGlobal ? null : process.env.DISCORD_GUILD_ID;
const scopeLabel = GUILD_ID ? `guild ${GUILD_ID}` : "global";

function baseUrl() {
  return GUILD_ID
    ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
    : `https://discord.com/api/v10/applications/${APP_ID}/commands`;
}

async function listCommands() {
  const { data } = await axios.get(baseUrl(), {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  if (data.length === 0) {
    console.log(`No commands registered in ${scopeLabel} scope.`);
    return;
  }
  console.log(`Commands in ${scopeLabel} scope:`);
  for (const cmd of data) {
    console.log(`  ${cmd.id}  /${cmd.name}  — ${cmd.description || "(no description)"}`);
  }
}

async function unregisterAll() {
  await axios.put(baseUrl(), [], {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  console.log(`Removed all commands from ${scopeLabel} scope.`);
}

async function unregisterOne(id) {
  await axios.delete(`${baseUrl()}/${id}`, {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  console.log(`Removed command ${id} from ${scopeLabel} scope.`);
}

async function run() {
  if (action === "list") {
    await listCommands();
  } else if (action) {
    await unregisterOne(action);
  } else {
    await unregisterAll();
  }
}

run().catch((err) => {
  console.error("Failed:", err.response?.data || err.message);
  process.exit(1);
});
