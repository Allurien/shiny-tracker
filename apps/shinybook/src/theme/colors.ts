// ShinyBook palette — purple → blue → teal blends.
// Single source of truth; the Gluestack config and any LinearGradient
// usage both pull from here.

export const palette = {
  // Brand spectrum (purple → blue → teal)
  purple: "#7B61FF",
  purpleDeep: "#5A3FE0",
  blue: "#5A8DEE",
  teal: "#3FC8C8",
  tealSoft: "#7FE0DE",

  // Surfaces (dark by default — diamond paintings look best on dark)
  bg: "#0F0E1F",
  surface: "#1A1A2E",
  surfaceAlt: "#252544",
  border: "#2E2E55",

  // Text
  text: "#F2F1FA",
  textMuted: "#A8A6C2",
  textSubtle: "#6E6C8E",

  // Status accents (status badges + filters)
  status: {
    wishlist: "#9F7AFE",   // light purple
    ordered: "#F0A75A",    // amber — distinct from brand spectrum
    stash: "#5A8DEE",      // blue
    inProgress: "#3FC8C8", // teal
    completed: "#6FE89B",  // mint
  },

  // Functional
  success: "#6FE89B",
  warning: "#F0A75A",
  danger: "#FF6B7E",

  // Drill-shape accents on list rows.
  drill: {
    round: "#E6A8E6",   // light violet-pink
    square: "#93B6F2",  // light lift of the gradient's middle blue
  },
} as const;

// Brand gradient — used for headers, primary CTAs, status hero strips.
export const brandGradient = [palette.purple, palette.blue, palette.teal] as const;

// Subtler bg gradient for cards / hero sections.
export const surfaceGradient = [palette.surface, palette.surfaceAlt] as const;
