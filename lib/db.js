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

// Run a Scan across all pages. Single-page Scans silently truncate at 1MB —
// with FilterExpression, pages can come back empty-after-filter while more
// results exist, so we must always follow LastEvaluatedKey.
async function scanAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await docClient.send(
      new ScanCommand({ ...params, ExclusiveStartKey })
    );
    if (result.Items) items.push(...result.Items);
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// BatchWriteItem can return UnprocessedItems (throttling, capacity). The
// default client does not retry those — we must re-submit them ourselves,
// otherwise writes silently disappear. Also dedupes keys within a batch,
// since DynamoDB rejects the whole batch if two requests share a pk.
async function batchWriteWithRetry(requests) {
  // Dedupe by the request's pk (either PutRequest.Item.pk or DeleteRequest.Key.pk)
  const seen = new Set();
  const deduped = requests.filter((r) => {
    const pk = r.PutRequest?.Item?.pk ?? r.DeleteRequest?.Key?.pk;
    if (!pk || seen.has(pk)) return false;
    seen.add(pk);
    return true;
  });

  for (let i = 0; i < deduped.length; i += 25) {
    let unprocessed = { [TABLE_NAME]: deduped.slice(i, i + 25) };
    let attempts = 0;
    while (unprocessed[TABLE_NAME] && unprocessed[TABLE_NAME].length > 0) {
      const result = await docClient.send(
        new BatchWriteCommand({ RequestItems: unprocessed })
      );
      unprocessed = result.UnprocessedItems || {};
      if (!unprocessed[TABLE_NAME] || unprocessed[TABLE_NAME].length === 0) break;
      if (++attempts > 5) {
        throw new Error(
          `BatchWrite: ${unprocessed[TABLE_NAME].length} items still unprocessed after ${attempts} retries`
        );
      }
      await new Promise((r) => setTimeout(r, 100 * 2 ** attempts));
    }
  }
}

// ---- Products ----

async function getKnownProducts() {
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "begins_with(pk, :prefix)",
    ExpressionAttributeValues: { ":prefix": "PRODUCT#" },
    ProjectionExpression: "pk",
  });
  return new Set(items.map((item) => item.pk.replace("PRODUCT#", "")));
}

async function addProducts(titles) {
  await batchWriteWithRetry(
    titles.map((title) => ({
      PutRequest: { Item: { pk: `PRODUCT#${title}` } },
    }))
  );
}

async function removeProducts(titles) {
  await batchWriteWithRetry(
    titles.map((title) => ({
      DeleteRequest: { Key: { pk: `PRODUCT#${title}` } },
    }))
  );
}

// ---- Subscribers ----

async function getSubscribers() {
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "begins_with(pk, :prefix)",
    ExpressionAttributeValues: { ":prefix": "SUB#" },
    ProjectionExpression: "userId",
  });
  return items.map((item) => item.userId);
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
  return scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "begins_with(pk, :prefix)",
    ExpressionAttributeValues: { ":prefix": `WISHLIST#${userId}#` },
  });
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
