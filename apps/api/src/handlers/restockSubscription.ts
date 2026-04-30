// Per-user restock subscription state. The bot's CheckFunction reads these
// rows directly out of DynamoDB (cross-stack IAM grant) when it detects new
// restocks, then fans out via Expo Push to anyone with enabled=true and a
// valid token.
//
// Key layout:
//   pk = USER#<sub>
//   sk = RESTOCK_SUB
//
// Single row per user — toggling sub/unsub or rotating the push token both
// upsert the same key. We deliberately don't gsi-index this; the bot scans
// for sk=RESTOCK_SUB once per scheduled run, which is fine at expected scale.

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../lib/auth";
import { TABLE, ddb, userPk } from "../lib/dynamo";
import { wrap } from "../lib/handler";
import { noContent, notFound, ok } from "../lib/response";
import {
  parseJson,
  restockSubscriptionSchema,
} from "../lib/validate";

const SK = "RESTOCK_SUB";
const now = () => new Date().toISOString();

interface SubscriptionRow {
  enabled: boolean;
  expoPushToken: string | null;
  updatedAt: string;
}

export const get = wrap(async (event) => {
  const sub = requireUserId(event);
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: SK },
    }),
  );
  if (!res.Item) return notFound();
  const { enabled, expoPushToken, updatedAt } = res.Item as SubscriptionRow;
  return ok({ enabled, expoPushToken, updatedAt });
});

export const put = wrap(async (event) => {
  const sub = requireUserId(event);
  const body = restockSubscriptionSchema.parse(parseJson(event.body));
  const row: SubscriptionRow = {
    enabled: body.enabled,
    expoPushToken: body.expoPushToken,
    updatedAt: now(),
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: userPk(sub), sk: SK, ...row },
    }),
  );
  return ok(row);
});

export const remove = wrap(async (event) => {
  const sub = requireUserId(event);
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: SK },
    }),
  );
  return noContent();
});
