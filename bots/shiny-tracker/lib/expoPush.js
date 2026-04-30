// Thin Expo Push API client. Sends batched push notifications via Expo's
// public endpoint — no Apple/Google credentials needed because the device
// SDK exchanges those for an ExponentPushToken at registration time.
//
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/
//
// Batching: Expo's endpoint accepts up to 100 messages per POST. We send
// in chunks of 100 and report token-level failures in the result so the
// caller can prune stale rows from DynamoDB.

const ENDPOINT = "https://exp.host/--/api/v2/push/send";
const MAX_BATCH = 100;

// Recognize tokens we should bother sending. Expo's prefix is the only
// reliable filter — anything else is either a stale row or a misconfigured
// device that won't accept the message.
function isExpoToken(token) {
  if (typeof token !== "string") return false;
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

// Send a batch of push messages. Each message must already include `to`.
// Returns { ok, errors } — errors is { token, reason } for tokens that came
// back with a hard failure (DeviceNotRegistered, InvalidCredentials, etc.).
async function sendPushes(messages) {
  const valid = messages.filter((m) => isExpoToken(m.to));
  const errors = [];

  for (let i = 0; i < valid.length; i += MAX_BATCH) {
    const batch = valid.slice(i, i + MAX_BATCH);
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
          "content-type": "application/json",
        },
        body: JSON.stringify(batch),
      });
    } catch (err) {
      console.error("[expoPush] network error", err.message);
      continue;
    }

    if (!response.ok) {
      console.error(
        `[expoPush] HTTP ${response.status} from Expo`,
        await response.text().catch(() => ""),
      );
      continue;
    }

    let body;
    try {
      body = await response.json();
    } catch {
      continue;
    }
    const tickets = Array.isArray(body?.data) ? body.data : [];
    tickets.forEach((ticket, idx) => {
      if (ticket?.status === "error") {
        errors.push({
          token: batch[idx]?.to,
          reason: ticket?.details?.error || ticket?.message || "unknown",
        });
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { sendPushes, isExpoToken };
