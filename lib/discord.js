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

async function sendChannelMessage(channelId, content, embeds = []) {
  const api = getApi();
  await api.post(`/channels/${channelId}/messages`, { content, embeds });
}

async function sendDM(userId, content, embeds = []) {
  const api = getApi();
  const { data: dm } = await api.post("/users/@me/channels", {
    recipient_id: userId,
  });
  await api.post(`/channels/${dm.id}/messages`, { content, embeds });
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
