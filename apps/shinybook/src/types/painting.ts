// Core domain type. Status maps the gemsflow flow exactly:
//   wishlist → ordered → stash → in_progress → completed
// Fields are mostly optional because URL-imported entries pre-populate
// some, manual entries pre-populate others, and users will edit.

export type PaintingStatus =
  | "wishlist"
  | "ordered"
  | "stash"
  | "in_progress"
  | "completed";

export type DrillShape = "round" | "square" | "specialty" | "unknown";

// How this painting entered the collection. Absent ≈ "purchase" (the common
// case). "destash" marks paintings acquired second-hand from another stasher.
export type PaintingSource = "purchase" | "destash";

export interface Painting {
  id: string;
  title: string;
  brand?: string;
  artist?: string;
  status: PaintingStatus;
  source?: PaintingSource;
  sourceUrl?: string;

  // Specs (from scraper or manual)
  canvasSize?: string;
  drillShape?: DrillShape;
  drillCount?: number;
  colorCount?: number;

  // Pricing
  price?: number;
  currency?: string;

  // Lifecycle dates (ISO 8601)
  purchasedAt?: string; // when ordered
  receivedAt?: string;  // when arrived → enters stash
  startedAt?: string;
  completedAt?: string;

  // Computed/cached
  hoursWorked?: number; // sum of session durations, in hours
  rating?: number;      // 1-5, set on completion

  // How many copies of this painting the user owns. Defaults to 1 when
  // absent. Bumped by the import dedup flow when the same painting is
  // registered again ("add another copy to your stash").
  quantity?: number;

  // Free-form event/release this painting was acquired at (e.g. "DAC
  // Anniversary 2025"). Presence is the "is event" signal — the form's
  // checkbox toggles this on/off.
  eventName?: string;

  // Media
  coverImage?: string;        // remote URL or local file URI
  progressPhotos?: string[];  // local file URIs

  // Free-form
  description?: string; // from scraper (e.g. body_html stripped)
  notes?: string;
  tags?: string[];

  createdAt: string;
  updatedAt: string;
}

// Patch for updates. Allows `null` on string/array fields as a "clear this"
// sentinel — the client omits-undefined over the wire (JSON.stringify drops
// undefined), so we need an explicit value to tell the server "clear this".
// The local DB serializer and the server handler both interpret null as clear.
export type PaintingPatch =
  & Partial<Omit<Painting, "id" | "createdAt" | "coverImage" | "progressPhotos" | "purchasedAt" | "receivedAt" | "startedAt" | "completedAt">>
  & {
    coverImage?: string | null;
    progressPhotos?: string[] | null;
    purchasedAt?: string | null;
    receivedAt?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  };

// Subset returned by scrapers — id/createdAt/etc. are added on save.
export type ScrapedPainting = Pick<
  Painting,
  | "title"
  | "brand"
  | "artist"
  | "sourceUrl"
  | "canvasSize"
  | "drillShape"
  | "drillCount"
  | "colorCount"
  | "price"
  | "currency"
  | "coverImage"
  | "description"
  | "tags"
>;
