// Single-table DynamoDB helpers.
//
// Key layout:
//   pk      = USER#<sub>
//   sk      = PAINTING#<id> | DRILL#<id> | SESSION#<id>
//   gsi1pk  = USER#<sub>#PAINTING | USER#<sub>#DRILL | USER#<sub>#SESSION
//   gsi1sk  = <updatedAt>#<id>                        — sync cursor
//   gsi2pk  = USER#<sub>#DRILL-NK                     — drill natural key only
//   gsi2sk  = <brand>#<drillNumber>
//
// The sync cursor index lets us query "everything for entity E updated since T".
// The drill-NK index lets us upsert by (brand, drillNumber) without scanning.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { Entity } from "../types";

const raw = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE = Resource.Data.name;

export const userPk = (sub: string) => `USER#${sub}`;

const entityPrefix: Record<Entity, string> = {
  painting: "PAINTING",
  drill: "DRILL",
  session: "SESSION",
};

export const entitySk = (entity: Entity, id: string) =>
  `${entityPrefix[entity]}#${id}`;

export const gsi1Pk = (sub: string, entity: Entity) =>
  `USER#${sub}#${entityPrefix[entity]}`;

export const gsi1Sk = (updatedAt: string, id: string) => `${updatedAt}#${id}`;

export const drillNkPk = (sub: string) => `USER#${sub}#DRILL-NK`;
export const drillNkSk = (brand: string, drillNumber: string) =>
  `${brand}#${drillNumber}`;

// Build the full row to write for any entity. Callers pass the domain object
// (with createdAt/updatedAt set) and this adds the key attributes.
export function buildRow<T extends { id: string; updatedAt: string }>(
  sub: string,
  entity: Entity,
  item: T,
  extra?: Record<string, string>,
) {
  return {
    pk: userPk(sub),
    sk: entitySk(entity, item.id),
    gsi1pk: gsi1Pk(sub, entity),
    gsi1sk: gsi1Sk(item.updatedAt, item.id),
    ...extra,
    ...item,
  };
}

// Strip the infrastructure key attributes before returning to the client.
export function stripKeys<T extends Record<string, unknown>>(row: T) {
  const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...rest } = row as any;
  return rest as Omit<T, "pk" | "sk" | "gsi1pk" | "gsi1sk" | "gsi2pk" | "gsi2sk">;
}
