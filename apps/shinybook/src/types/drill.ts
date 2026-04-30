// Drill inventory entry — what the user physically owns in their stash.
// Kept separate from Painting because the same drill (e.g. DMC 310) can be
// shared across many paintings.

import type { DrillShape } from "./painting";

// Finish type applied on top of the drill's base shape. "standard" means no
// special coating. DAC adds Fairy Dust and Electro Diamond on top of AB.
export type DrillSpecialtyType = "standard" | "ab" | "fairy_dust" | "electro_diamond";

// Prefix applied to the stored drillNumber for DAC specialty types.
export const DAC_SPECIALTY_PREFIXES: Record<DrillSpecialtyType, string> = {
  standard:        "",
  ab:              "AB",
  fairy_dust:      "Z",
  electro_diamond: "L",
};

export interface Drill {
  id: string;
  drillNumber: string;            // compiled number incl. prefix, e.g. "AB310"
  brand: string;                  // "Diamond Art Club", "Oraloa", or custom
  shape: Exclude<DrillShape, "unknown">;
  specialtyType?: DrillSpecialtyType;
  approximateCount: number;       // user's rough estimate; not authoritative
  colorName?: string;             // optional friendly label
  colorHex?: string;              // optional swatch hex, e.g. "#ff0000"
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
