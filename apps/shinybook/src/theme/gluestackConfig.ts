// Gluestack v2 theme config — overrides default tokens with our palette.
// Components like <Button>, <Box>, <Heading> inherit these.

import { config as defaultConfig } from "@gluestack-ui/config";

import { palette } from "./colors";

export const config = {
  ...defaultConfig,
  tokens: {
    ...defaultConfig.tokens,
    colors: {
      ...defaultConfig.tokens.colors,
      // Brand
      primary500: palette.purple,
      primary600: palette.purpleDeep,
      primary400: "#9784FF",
      primary300: "#B5A8FF",

      secondary500: palette.teal,
      secondary600: "#33A8A8",
      secondary400: palette.tealSoft,

      // Map background tokens to our dark surfaces by default
      background0: palette.bg,
      background50: palette.surface,
      background100: palette.surfaceAlt,
      backgroundLight0: palette.bg,
      backgroundLight50: palette.surface,
      backgroundLight100: palette.surfaceAlt,
      backgroundDark0: palette.bg,
      backgroundDark50: palette.surface,
      backgroundDark100: palette.surfaceAlt,

      // Borders
      borderLight300: palette.border,
      borderDark300: palette.border,
    },
  },
};
