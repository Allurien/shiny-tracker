import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { requireUserId } from "../lib/auth";
import {
  TABLE,
  buildRow,
  ddb,
  entitySk,
  gsi1Pk,
  gsi1Sk,
  stripKeys,
  userPk,
} from "../lib/dynamo";
import { wrap } from "../lib/handler";
import {
  created,
  noContent,
  notFound,
  ok,
} from "../lib/response";
import {
  paintingCreateSchema,
  paintingUpdateSchema,
  parseJson,
} from "../lib/validate";
import type { Painting } from "../types";

const now = () => new Date().toISOString();

async function getRow(sub: string, id: string) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: entitySk("painting", id) },
    }),
  );
  return res.Item as (Painting & Record<string, unknown>) | undefined;
}

export const list = wrap(async (event) => {
  const sub = requireUserId(event);
  // Query by GSI1 (sorted by updatedAt). Clients can also use /sync for deltas.
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi1-updated",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": gsi1Pk(sub, "painting") },
      ScanIndexForward: false,
    }),
  );
  const items = (res.Items ?? [])
    .map((r) => stripKeys(r as Record<string, unknown>) as Painting)
    .filter((p) => !p.deletedAt);
  return ok({ items });
});

export const create = wrap(async (event) => {
  const sub = requireUserId(event);
  const { id: providedId, ...rest } = paintingCreateSchema.parse(
    parseJson(event.body),
  );
  const t = now();
  const painting: Painting = {
    id: providedId ?? randomUUID(),
    ...rest,
    createdAt: t,
    updatedAt: t,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: buildRow(sub, "painting", painting),
    }),
  );
  return created(painting);
});

export const get = wrap(async (event) => {
  const sub = requireUserId(event);
  const id = event.pathParameters?.id;
  if (!id) return notFound();
  const row = await getRow(sub, id);
  if (!row || row.deletedAt) return notFound();
  return ok(stripKeys(row));
});

export const update = wrap(async (event) => {
  const sub = requireUserId(event);
  const id = event.pathParameters?.id;
  if (!id) return notFound();
  const patch = paintingUpdateSchema.parse(parseJson(event.body));
  const existing = await getRow(sub, id);
  if (!existing || existing.deletedAt) return notFound();

  // Null in a patch means "clear this field". We scrub nulls out of the patch
  // before merging so the final row actually loses those attributes after the
  // PutCommand (which replaces in full).
  const scrubbed: Record<string, unknown> = {};
  const toClear = new Set<string>();
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) toClear.add(key);
    else scrubbed[key] = value;
  }
  const existingStripped = stripKeys(existing) as Record<string, unknown>;
  for (const key of toClear) delete existingStripped[key];
  const merged = {
    ...existingStripped,
    ...scrubbed,
    id,
    updatedAt: now(),
  } as Painting;
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: buildRow(sub, "painting", merged),
    }),
  );
  return ok(merged);
});

export const remove = wrap(async (event) => {
  const sub = requireUserId(event);
  const id = event.pathParameters?.id;
  if (!id) return notFound();
  const existing = await getRow(sub, id);
  if (!existing) return noContent();

  // Soft delete so offline clients can sync the removal.
  const t = now();
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: entitySk("painting", id) },
      UpdateExpression:
        "SET deletedAt = :t, updatedAt = :t, gsi1sk = :sk",
      ExpressionAttributeValues: {
        ":t": t,
        ":sk": gsi1Sk(t, id),
      },
    }),
  );
  return noContent();
});

// Used by the hard-delete admin path (not currently wired). Kept to make
// intent explicit in case we ever want a purge endpoint.
export async function purge(sub: string, id: string) {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: entitySk("painting", id) },
    }),
  );
}
