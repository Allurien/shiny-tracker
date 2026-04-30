// GET /sync?entity=painting&since=<iso>[&limit=N]
//
// Returns all rows of `entity` updated at or after `since`, INCLUDING soft-
// deleted ones — the client needs those to mirror remote deletes. Response
// also carries a cursor the client stores and passes back as `since` next time.
//
// The sync cursor GSI is sorted by `<updatedAt>#<id>`, so we use a
// range-KeyCondition to slice from the since timestamp forward.

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../lib/auth";
import { TABLE, ddb, gsi1Pk, stripKeys } from "../lib/dynamo";
import { wrap } from "../lib/handler";
import { ok } from "../lib/response";
import { syncQuerySchema } from "../lib/validate";

export const changes = wrap(async (event) => {
  const sub = requireUserId(event);
  const { entity, since, limit } = syncQuerySchema.parse({
    ...event.queryStringParameters,
  });

  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi1-updated",
      KeyConditionExpression: since
        ? "gsi1pk = :pk AND gsi1sk >= :since"
        : "gsi1pk = :pk",
      ExpressionAttributeValues: {
        ":pk": gsi1Pk(sub, entity),
        ...(since ? { ":since": since } : {}),
      },
      ScanIndexForward: true,
      Limit: limit ?? 200,
    }),
  );

  const items = (res.Items ?? []).map((r) =>
    stripKeys(r as Record<string, unknown>),
  );
  const cursor =
    items.length > 0
      ? (items[items.length - 1] as { updatedAt: string }).updatedAt
      : since ?? null;

  return ok({ items, cursor });
});
