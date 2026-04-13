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

module.exports = {
  getKnownProducts,
  addProducts,
  getSubscribers,
  addSubscriber,
  removeSubscriber,
  isSubscribed,
  getSubscriberCount,
};
