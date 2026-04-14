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

module.exports = { buildEmbed, sendChannelMessage, sendDM, verifySignature };
