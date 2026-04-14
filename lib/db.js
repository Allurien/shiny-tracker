const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  GetCommand,
  BatchWriteCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME;

// ---- Products ----

async function getKnownProducts() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(pk, :prefix)",
      ExpressionAttributeValues: { ":prefix": "PRODUCT#" },
      ProjectionExpression: "pk",
    })
  );
  return new Set(
    (result.Items || []).map((item) => item.pk.replace("PRODUCT#", ""))
  );
}

async function addProducts(titles) {
  for (let i = 0; i < titles.length; i += 25) {
    const batch = titles.slice(i, i + 25);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((title) => ({
            PutRequest: { Item: { pk: `PRODUCT#${title}` } },
          })),
        },
      })
    );
  }
}

async function removeProducts(titles) {
  for (let i = 0; i < titles.length; i += 25) {
    const batch = titles.slice(i, i + 25);
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((title) => ({
            DeleteRequest: { Key: { pk: `PRODUCT#${title}` } },
          })),
        },
      })
    );
  }
}

// ---- Subscribers ----

async function getSubscribers() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(pk, :prefix)",
      ExpressionAttributeValues: { ":prefix": "SUB#" },
      ProjectionExpression: "userId",
    })
  );
  return (result.Items || []).map((item) => item.userId);
}

async function addSubscriber(userId) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk: `SUB#${userId}`, userId },
    })
  );
}

async function removeSubscriber(userId) {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: `SUB#${userId}` },
    })
  );
}

async function isSubscribed(userId) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `SUB#${userId}` },
    })
  );
  return !!result.Item;
}

async function getSubscriberCount() {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(pk, :prefix)",
      ExpressionAttributeValues: { ":prefix": "SUB#" },
      Select: "COUNT",
    })
  );
  return result.Count;
}

// ---- Wishlists ----
// Wishlists belong to subscribers. The scheduled check iterates subscribers
// and pulls each one's wishlists via getWishlistsForUser — we never scan
// wishlists globally, so orphaned wishlists (from unsubscribed users) are
// naturally ignored.

async function addWishlist(userId, lid, url, name) {
  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `WISHLIST#${userId}#${lid}`,
        userId,
        lid,
        url,
        name: name || `Wishlist ${lid.slice(0, 8)}`,
        addedAt: new Date().toISOString(),
      },
    })
  );
}

async function removeWishlist(userId, lid) {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: `WISHLIST#${userId}#${lid}` },
    })
  );
}

async function getWishlistsForUser(userId) {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(pk, :prefix)",
      ExpressionAttributeValues: { ":prefix": `WISHLIST#${userId}#` },
    })
  );
  return result.Items || [];
}

module.exports = {
  getKnownProducts,
  addProducts,
  removeProducts,
  getSubscribers,
  addSubscriber,
  removeSubscriber,
  isSubscribed,
  getSubscriberCount,
  addWishlist,
  removeWishlist,
  getWishlistsForUser,
};
