const axios = require("axios");
const nacl = require("tweetnacl");

const DISCORD_API = "https://discord.com/api/v10";

function getApi() {
  return axios.create({
    baseURL: DISCORD_API,
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
  });
}

function buildEmbed(product) {
  const embed = {
    title: product.title,
    color: 0xe91e8c,
    timestamp: new Date().toISOString(),
  };
  if (product.url) embed.url = product.url;
  if (product.image) embed.thumbnail = { url: product.image };
  if (product.price) embed.fields = [{ name: "Price", value: product.price }];
  return embed;
}

// Discord allows max 10 embeds per message — chunk larger batches
const MAX_EMBEDS = 10;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function sendChannelMessage(channelId, content, embeds = []) {
  const api = getApi();
  if (embeds.length <= MAX_EMBEDS) {
    await api.post(`/channels/${channelId}/messages`, { content, embeds });
    return;
  }
  const batches = chunk(embeds, MAX_EMBEDS);
  for (let i = 0; i < batches.length; i++) {
    await api.post(`/channels/${channelId}/messages`, {
      content: i === 0 ? content : undefined,
      embeds: batches[i],
    });
  }
}

async function sendDM(userId, content, embeds = []) {
  const api = getApi();
  const { data: dm } = await api.post("/users/@me/channels", {
    recipient_id: userId,
  });
  if (embeds.length <= MAX_EMBEDS) {
    await api.post(`/channels/${dm.id}/messages`, { content, embeds });
    return;
  }
  const batches = chunk(embeds, MAX_EMBEDS);
  for (let i = 0; i < batches.length; i++) {
    await api.post(`/channels/${dm.id}/messages`, {
      content: i === 0 ? content : undefined,
      embeds: batches[i],
    });
  }
}

// A "restock alert" posts up to 10 embeds and lists any overflow as plain
// text in one or more follow-up messages. Kept as one helper so the channel
// post and subscriber DMs stay consistent.
//
// `send(content, embeds)` is a Promise-returning function that posts to the
// caller's chosen target (channel or user DM).
// 10 matches Discord's per-message embed cap, so the headline + embeds fit
// in a single message with no chunking — only the overflow list follows up.
const RESTOCK_MAX_EMBEDS = 10;
const MAX_MESSAGE_CONTENT = 1900; // Discord's hard cap is 2000; leave slack

async function sendRestockAlert(send, products) {
  const shown = products.slice(0, RESTOCK_MAX_EMBEDS);
  const extras = products.slice(RESTOCK_MAX_EMBEDS);
  const headline = `\u{1F514} **New Restock Alert!** (${products.length} new item${products.length > 1 ? "s" : ""})`;

  await send(headline, shown.map(buildEmbed));

  if (extras.length === 0) return;

  // Follow-up list of overflow items. Chunk across messages so no single
  // message exceeds Discord's 2000-char content limit.
  const header = `\u2795 **Plus ${extras.length} more:**`;
  const bullets = extras.map((p) => `\u2022 ${p.title}`);

  const messages = [];
  let current = header;
  for (const line of bullets) {
    if (current.length + 1 + line.length > MAX_MESSAGE_CONTENT) {
      messages.push(current);
      current = line;
    } else {
      current += "\n" + line;
    }
  }
  messages.push(current);

  for (const content of messages) {
    await send(content, []);
  }
}

function verifySignature(rawBody, signature, timestamp, publicKey) {
  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );
  } catch {
    return false;
  }
}

module.exports = {
  buildEmbed,
  sendChannelMessage,
  sendDM,
  sendRestockAlert,
  verifySignature,
};
