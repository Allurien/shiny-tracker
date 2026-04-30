// Reads the app's DynamoDB (separate stack from the bot) for users who
// opted in to restock push notifications, plus their wishlist paintings for
// match filtering.
//
// Cross-stack access pattern:
//   - Bot's CloudFormation stack takes APP_TABLE_NAME as a parameter.
//   - Bot's IAM role grants Scan/Query on that table arn (read-only).
//   - This module talks to that table directly — no API hop.
//
// Schema (shared with apps/api):
//   Subscription row:  pk=USER#<sub>, sk=RESTOCK_SUB
//                      attrs: enabled, expoPushToken, updatedAt
//   Wishlist painting: pk=USER#<sub>, sk=PAINTING#<id>, status="wishlist"
//                      gsi1pk=USER#<sub>#PAINTING gsi1sk=<updatedAt>#<id>

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const APP_TABLE_NAME = process.env.APP_TABLE_NAME;

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

async function scanAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await docClient.send(
      new ScanCommand({ ...params, ExclusiveStartKey }),
    );
    if (result.Items) items.push(...result.Items);
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Returns active subscriptions: { sub, expoPushToken } per user.
// Drops rows missing a token or with enabled=false — both are unreachable.
async function listActiveSubscribers() {
  if (!APP_TABLE_NAME) {
    console.warn("[appSubscribers] APP_TABLE_NAME not set — skipping fan-out");
    return [];
  }
  const items = await scanAll({
    TableName: APP_TABLE_NAME,
    FilterExpression: "sk = :sk AND enabled = :true",
    ExpressionAttributeValues: { ":sk": "RESTOCK_SUB", ":true": true },
    ProjectionExpression: "pk, expoPushToken",
  });
  const out = [];
  for (const item of items) {
    if (typeof item.expoPushToken !== "string" || !item.expoPushToken) continue;
    const pk = typeof item.pk === "string" ? item.pk : "";
    const sub = pk.startsWith("USER#") ? pk.slice("USER#".length) : null;
    if (!sub) continue;
    out.push({ sub, expoPushToken: item.expoPushToken });
  }
  return out;
}

// Returns the titles of every painting the user has marked status="wishlist".
// Uses gsi1 (USER#<sub>#PAINTING) to avoid scanning unrelated rows.
async function getWishlistTitles(sub) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: APP_TABLE_NAME,
        IndexName: "gsi1-updated",
        KeyConditionExpression: "gsi1pk = :pk",
        // Only "wishlist" paintings, and skip soft-deleted rows.
        FilterExpression:
          "#status = :wishlist AND attribute_not_exists(deletedAt)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":pk": `USER#${sub}#PAINTING`,
          ":wishlist": "wishlist",
        },
        ProjectionExpression: "title",
        ExclusiveStartKey,
      }),
    );
    if (result.Items) items.push(...result.Items);
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.map((i) => i.title).filter((t) => typeof t === "string");
}

module.exports = { listActiveSubscribers, getWishlistTitles };
