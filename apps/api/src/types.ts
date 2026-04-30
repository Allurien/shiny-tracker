// Server-side entity shapes. Mirror the client types but:
//   - add `deletedAt` for soft-delete + sync semantics
//   - all client-facing fields are optional except the invariants (id, timestamps)
// The handler layer is responsible for filtering out soft-deleted rows from
// non-sync reads.

export type PaintingStatus =
  | "wishlist"
  | "ordered"
  | "stash"
  | "in_progress"
  | "completed";

export type DrillShape = "round" | "square" | "specialty" | "unknown";

export type PaintingSource = "purchase" | "destash";

export interface Painting {
  id: string;
  title: string;
  brand?: string;
  artist?: string;
  status: PaintingStatus;
  source?: PaintingSource;
  sourceUrl?: string;
  canvasSize?: string;
  drillShape?: DrillShape;
  drillCount?: number;
  colorCount?: number;
  price?: number;
  currency?: string;
  purchasedAt?: string;
  receivedAt?: string;
  startedAt?: string;
  completedAt?: string;
  hoursWorked?: number;
  rating?: number;
  quantity?: number;
  eventName?: string;
  coverImage?: string;
  progressPhotos?: string[];
  description?: string;
  notes?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Drill {
  id: string;
  drillNumber: string;
  brand: string;
  shape: Exclude<DrillShape, "unknown">;
  approximateCount: number;
  colorName?: string;
  colorHex?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Session {
  id: string;
  paintingId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type Entity = "painting" | "drill" | "session";

// Tracked wishlist source (a DAC share URL the user pasted at import time).
// Lets the app re-scrape the same URL on demand and diff against the user's
// current paintings to surface adds/removals — same model the bot uses for
// Discord subscribers, just stored against the app's Cognito user.
//
// Key layout:
//   pk = USER#<sub>
//   sk = WISHLIST_SOURCE#<lid>
//
// snapshotHandles is the set of product handles that were on the wishlist
// the last time we scraped it. Diffing the next scrape against this snapshot
// gives us the (added, removed) sets without scanning every painting.
export interface WishlistSource {
  id: string; // lid (DAC's wishlist UUID); also doubles as the row's logical id
  url: string;
  name: string;
  snapshotHandles: string[];
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}
