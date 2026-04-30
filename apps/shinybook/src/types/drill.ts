// Drill inventory entry — what the user physically owns in their stash.
// Kept separate from Painting because the same drill (e.g. DMC 310) can be
// shared across many paintings.

import type { DrillShape } from "./painting";

export interface Drill {
  id: string;
  drillNumber: string;            // e.g. "DMC 310" or "DAC-5609"
  brand: string;                  // "DMC", "Diamond Art Club", "Generic", ...
  shape: Exclude<DrillShape, "unknown">;
  approximateCount: number;       // user's rough estimate; not authoritative
  colorName?: string;             // optional friendly label
  colorHex?: string;              // optional swatch
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
