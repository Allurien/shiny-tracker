// Tracked DAC wishlist URLs. Stored so the wishlist tab can re-scrape the
// same URL later and diff against the user's current paintings (adds +
// removals). One row per DAC list (`id` is the DAC `lid`); re-imports of the
// same list upsert.

import { requestJson, requestNoBody } from "./client";

export interface WishlistSource {
  id: string;
  url: string;
  name: string;
  snapshotHandles: string[];
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export async function listSources(): Promise<WishlistSource[]> {
  const res = await requestJson<{ items: WishlistSource[] }>(
    "/wishlist-sources",
  );
  return res.items;
}

export async function putSource(args: {
  id: string;
  url: string;
  name: string;
  snapshotHandles: string[];
}): Promise<WishlistSource> {
  return requestJson<WishlistSource>("/wishlist-sources", {
    method: "POST",
    body: args,
  });
}

export async function patchSource(
  id: string,
  args: { name?: string; snapshotHandles?: string[] },
): Promise<WishlistSource> {
  return requestJson<WishlistSource>(`/wishlist-sources/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: args,
  });
}

export async function deleteSource(id: string): Promise<void> {
  await requestNoBody(`/wishlist-sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
