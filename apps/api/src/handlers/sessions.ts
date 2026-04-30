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
  entitySk,
  gsi1Pk,
  gsi1Sk,
  stripKeys,
  userPk,
} from "../lib/dynamo";
import { wrap } from "../lib/handler";
import { created, noContent, notFound, ok } from "../lib/response";
import {
  parseJson,
  sessionCreateSchema,
  sessionUpdateSchema,
} from "../lib/validate";
import type { Session } from "../types";

const now = () => new Date().toISOString();

async function getRow(sub: string, id: string) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(sub), sk: entitySk("session", id) },
    }),
  );
  return res.Item as (Session & Record<string, unknown>) | undefined;
}

// GET /sessions?paintingId=xxx — optional filter, otherwise all sessions.
export const list = wrap(async (event) => {
  const sub = requireUserId(event);
  const paintingId = event.queryStringParameters?.paintingId;
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi1-updated",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": gsi1Pk(sub, "session") },
      ScanIndexForward: false,
    }),
  );
  const items = (res.Items ?? [])
    .map((r) => stripKeys(r as Record<string, unknown>) as Session)
    .filter((s) => !s.deletedAt && (!paintingId || s.paintingId === paintingId));
  return ok({ items });
});

export const create = wrap(async (event) => {
  const sub = requireUserId(event);
  const { id: providedId, ...rest } = sessionCreateSchema.parse(
    parseJson(event.body),
  );
  const t = now();
  const session: Session = {
    id: providedId ?? randomUUID(),
    ...rest,
    endedAt: rest.endedAt ?? null,
    createdAt: t,
    updatedAt: t,
  };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: buildRow(sub, "session", session) }),
  );
  return created(session);
});

export const update = wrap(async (event) => {
  const sub = requireUserId(event);
  const id = event.pathParameters?.id;
  if (!id) return notFound();
  const patch = sessionUpdateSchema.parse(parseJson(event.body));
  const existing = await getRow(sub, id);
  if (!existing || existing.deletedAt) return notFound();

  const merged: Session = {
    ...(stripKeys(existing) as Session),
    ...patch,
    id,
    endedAt: patch.endedAt === undefined ? existing.endedAt : patch.endedAt ?? null,
    updatedAt: now(),
  };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: buildRow(sub, "session", merged) }),
  );
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
      Key: { pk: userPk(sub), sk: entitySk("session", id) },
      UpdateExpression: "SET deletedAt = :t, updatedAt = :t, gsi1sk = :sk",
      ExpressionAttributeValues: { ":t": t, ":sk": gsi1Sk(t, id) },
    }),
  );
  return noContent();
});
