import {
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
  drillNkPk,
  drillNkSk,
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
  drillCreateSchema,
  drillUpdateSchema,
  drillUpsertSchema,
  parseJson,
} from "../lib/validate";
import type { Drill } from "../types";

const now = () => new Date().toISOString();

const drillRow = (sub: string, d: Drill) =>
  buildRow(sub, "drill", d, {
    gsi2pk: drillNkPk(sub),
    gsi2sk: drillNkSk(d.brand, d.drillNumber),
  });

async function getRow(sub: string, id: string) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: entitySk("drill", id) },
    }),
  );
  return res.Item as (Drill & Record<string, unknown>) | undefined;
}

async function findByNaturalKey(sub: string, brand: string, drillNumber: string) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi2-drill-nk",
      KeyConditionExpression: "gsi2pk = :pk AND gsi2sk = :sk",
      ExpressionAttributeValues: {
        ":pk": drillNkPk(sub),
        ":sk": drillNkSk(brand, drillNumber),
      },
      Limit: 1,
    }),
  );
  return res.Items?.[0] as (Drill & Record<string, unknown>) | undefined;
}

export const list = wrap(async (event) => {
  const sub = requireUserId(event);
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi1-updated",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": gsi1Pk(sub, "drill") },
      ScanIndexForward: false,
    }),
  );
  const items = (res.Items ?? [])
    .map((r) => stripKeys(r as Record<string, unknown>) as Drill)
    .filter((d) => !d.deletedAt);
  return ok({ items });
});

export const create = wrap(async (event) => {
  const sub = requireUserId(event);
  const { id: providedId, ...rest } = drillCreateSchema.parse(
    parseJson(event.body),
  );
  const t = now();
  const drill: Drill = {
    id: providedId ?? randomUUID(),
    ...rest,
    createdAt: t,
    updatedAt: t,
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: drillRow(sub, drill) }));
  return created(drill);
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
  const patch = drillUpdateSchema.parse(parseJson(event.body));
  const existing = await getRow(sub, id);
  if (!existing || existing.deletedAt) return notFound();

  const merged: Drill = {
    ...(stripKeys(existing) as Drill),
    ...patch,
    id,
    updatedAt: now(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: drillRow(sub, merged) }));
  return ok(merged);
});

export const remove = wrap(async (event) => {
  const sub = requireUserId(event);
  const id = event.pathParameters?.id;
  if (!id) return notFound();
  const existing = await getRow(sub, id);
  if (!existing) return noContent();

  const t = now();
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: entitySk("drill", id) },
      UpdateExpression: "SET deletedAt = :t, updatedAt = :t, gsi1sk = :sk",
      ExpressionAttributeValues: { ":t": t, ":sk": gsi1Sk(t, id) },
    }),
  );
  return noContent();
});

// POST /drills/upsert
// Bulk add-or-increment by (brand, drillNumber). Mirrors the client's
// upsertDrills used by the "log leftover drills" completion flow.
export const upsert = wrap(async (event) => {
  const sub = requireUserId(event);
  const { items } = drillUpsertSchema.parse(parseJson(event.body));
  const t = now();
  const results: Drill[] = [];

  for (const item of items) {
    const existing = await findByNaturalKey(sub, item.brand, item.drillNumber);
    if (existing && !existing.deletedAt) {
      const merged: Drill = {
        ...(stripKeys(existing) as Drill),
        approximateCount:
          (existing.approximateCount ?? 0) + item.approximateCount,
        colorName: item.colorName ?? existing.colorName,
        colorHex: item.colorHex ?? existing.colorHex,
        notes: item.notes ?? existing.notes,
        shape: item.shape,
        updatedAt: t,
      };
      await ddb.send(
        new PutCommand({ TableName: TABLE, Item: drillRow(sub, merged) }),
      );
      results.push(merged);
    } else {
      const drill: Drill = {
        id: randomUUID(),
        ...item,
        createdAt: t,
        updatedAt: t,
      };
      await ddb.send(
        new PutCommand({ TableName: TABLE, Item: drillRow(sub, drill) }),
      );
      results.push(drill);
    }
  }

  return ok({ items: results });
});
