// Paintings API — signature-compatible with src/db/paintings.ts where
// possible. Differences:
//   - `listPaintings` filters client-side (server returns all non-deleted).
//   - `updatePainting` returns the merged painting (server echoes it); the
//     local DB version returned void. Callers that ignored the return value
//     still work.
//   - `countByStatus` is computed client-side over the list.

import type { Painting, PaintingStatus } from "../types/painting";
import { requestJson, requestNoBody } from "./client";

interface ListResponse {
  items: Painting[];
}

export async function createPainting(
  input: Omit<Painting, "id" | "createdAt" | "updatedAt">,
): Promise<Painting> {
  return requestJson<Painting>("/paintings", { method: "POST", body: input });
}

export async function updatePainting(
  id: string,
  patch: Partial<Omit<Painting, "id" | "createdAt">>,
): Promise<Painting> {
  return requestJson<Painting>(`/paintings/${id}`, { method: "PATCH", body: patch });
}

export async function deletePainting(id: string): Promise<void> {
  await requestNoBody(`/paintings/${id}`, { method: "DELETE" });
}

export async function getPainting(id: string): Promise<Painting | null> {
  try {
    return await requestJson<Painting>(`/paintings/${id}`);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function listPaintings(
  opts: {
    status?: PaintingStatus | PaintingStatus[];
    brand?: string;
    drillShape?: string;
    search?: string;
    orderBy?: "createdAt" | "updatedAt" | "completedAt" | "title";
    direction?: "ASC" | "DESC";
  } = {},
): Promise<Painting[]> {
  const { items } = await requestJson<ListResponse>("/paintings");
  let list = items;

  if (opts.status) {
    const arr = Array.isArray(opts.status) ? opts.status : [opts.status];
    list = list.filter((p) => arr.includes(p.status));
  }
  if (opts.brand) list = list.filter((p) => p.brand === opts.brand);
  if (opts.drillShape) list = list.filter((p) => p.drillShape === opts.drillShape);
  if (opts.search) {
    const q = opts.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.artist?.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q),
    );
  }

  const orderBy = opts.orderBy ?? "updatedAt";
  const direction = opts.direction ?? "DESC";
  list = [...list].sort((a, b) => {
    const av = (a[orderBy] as string | undefined) ?? "";
    const bv = (b[orderBy] as string | undefined) ?? "";
    if (av === bv) return 0;
    return direction === "ASC" ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
  });

  return list;
}

export async function countByStatus(): Promise<Record<PaintingStatus, number>> {
  const { items } = await requestJson<ListResponse>("/paintings");
  const out: Record<PaintingStatus, number> = {
    wishlist: 0, ordered: 0, stash: 0, in_progress: 0, completed: 0,
  };
  for (const p of items) out[p.status]++;
  return out;
}

function isNotFound(err: unknown): boolean {
  return !!(err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404);
}
