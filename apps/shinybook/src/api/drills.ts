// Drills API — signature-compatible with src/db/drills.ts.
// `upsertDrills` returns the server's merged list (local version returned void).

import type { Drill } from "../types/drill";
import { requestJson, requestNoBody } from "./client";

interface ListResponse {
  items: Drill[];
}

type DrillInput = Omit<Drill, "id" | "createdAt" | "updatedAt">;

export async function createDrill(input: DrillInput): Promise<Drill> {
  return requestJson<Drill>("/drills", { method: "POST", body: input });
}

export async function updateDrill(
  id: string,
  patch: Partial<Omit<Drill, "id" | "createdAt">>,
): Promise<Drill> {
  return requestJson<Drill>(`/drills/${id}`, { method: "PATCH", body: patch });
}

export async function deleteDrill(id: string): Promise<void> {
  await requestNoBody(`/drills/${id}`, { method: "DELETE" });
}

export async function getDrill(id: string): Promise<Drill | null> {
  try {
    return await requestJson<Drill>(`/drills/${id}`);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function listDrills(
  opts: { brand?: string; shape?: string; search?: string } = {},
): Promise<Drill[]> {
  const { items } = await requestJson<ListResponse>("/drills");
  let list = items;
  if (opts.brand) list = list.filter((d) => d.brand === opts.brand);
  if (opts.shape) list = list.filter((d) => d.shape === opts.shape);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    list = list.filter(
      (d) =>
        d.drillNumber.toLowerCase().includes(q) ||
        d.colorName?.toLowerCase().includes(q),
    );
  }
  return [...list].sort((a, b) => {
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    return a.drillNumber.localeCompare(b.drillNumber);
  });
}

export async function upsertDrills(items: DrillInput[]): Promise<Drill[]> {
  const { items: merged } = await requestJson<ListResponse>("/drills/upsert", {
    method: "POST",
    body: { items },
  });
  return merged;
}

function isNotFound(err: unknown): boolean {
  return !!(err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404);
}
