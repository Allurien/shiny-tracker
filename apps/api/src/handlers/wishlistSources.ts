// Wishlist source CRUD. A "source" is a DAC share URL the user pasted at
// import time — keeping it stored lets the app re-scrape the same URL later
// and diff the result against the user's current paintings (adds + removals).
//
// Key layout:
//   pk = USER#<sub>, sk = WISHLIST_SOURCE#<lid>
//
// We don't bother with sync-cursor indexing for these rows — they don't ride
// the offline-first sync path; they're only read interactively when the user
// taps "Refresh" in the wishlist tab.

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../lib/auth";
import { TABLE, ddb, userPk } from "../lib/dynamo";
import { wrap } from "../lib/handler";
import { created, noContent, notFound, ok } from "../lib/response";
import {
  parseJson,
  wishlistSourceCreateSchema,
  wishlistSourceUpdateSchema,
} from "../lib/validate";
import type { WishlistSource } from "../types";

const SK_PREFIX = "WISHLIST_SOURCE#";
const sourceSk = (id: string) => `${SK_PREFIX}${id}`;
const now = () => new Date().toISOString();

function stripRow(row: Record<string, unknown>): WishlistSource {
  const { pk, sk, ...rest } = row;
  void pk;
  void sk;
  return rest as unknown as WishlistSource;
}

export const list = wrap(async (event) => {
  const sub = requireUserId(event);
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": userPk(sub),
        ":prefix": SK_PREFIX,
      },
    }),
  );
  const items = (res.Items ?? []).map((r) =>
    stripRow(r as Record<string, unknown>),
  );
  return ok({ items });
});

export const get = wrap(async (event) => {
  const sub = requireUserId(event);
  const id = event.pathParameters?.id;
  if (!id) return notFound();
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: sourceSk(id) },
    }),
  );
  if (!res.Item) return notFound();
  return ok(stripRow(res.Item as Record<string, unknown>));
});

// Upsert keyed by id — repeated imports of the same DAC list refresh in place
// instead of stacking duplicates. Matches the natural mental model: one DAC
// list = one row regardless of how many times the user re-imports it.
export const put = wrap(async (event) => {
  const sub = requireUserId(event);
  const body = wishlistSourceCreateSchema.parse(parseJson(event.body));
  const t = now();
  const existing = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: sourceSk(body.id) },
    }),
  );
  const createdAt =
    (existing.Item as { createdAt?: string } | undefined)?.createdAt ?? t;
  const item: WishlistSource = {
    id: body.id,
    url: body.url,
    name: body.name,
    snapshotHandles: body.snapshotHandles,
    lastSyncedAt: t,
    createdAt,
    updatedAt: t,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: userPk(sub), sk: sourceSk(body.id), ...item },
    }),
  );
  return existing.Item ? ok(item) : created(item);
});

// Patch — used after a refresh to update lastSyncedAt + snapshotHandles
// without rewriting the whole row's url/name from the client.
export const patch = wrap(async (event) => {
  const sub = requireUserId(event);
  const id = event.pathParameters?.id;
  if (!id) return notFound();
  const body = wishlistSourceUpdateSchema.parse(parseJson(event.body));
  const existing = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: sourceSk(id) },
    }),
  );
  if (!existing.Item) return notFound();
  const t = now();
  const merged: WishlistSource = {
    ...(stripRow(existing.Item as Record<string, unknown>) as WishlistSource),
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.snapshotHandles !== undefined
      ? { snapshotHandles: body.snapshotHandles, lastSyncedAt: t }
      : {}),
    updatedAt: t,
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: userPk(sub), sk: sourceSk(id), ...merged },
    }),
  );
  return ok(merged);
});

export const remove = wrap(async (event) => {
  const sub = requireUserId(event);
  const id = event.pathParameters?.id;
  if (!id) return notFound();
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: sourceSk(id) },
    }),
  );
  return noContent();
});
