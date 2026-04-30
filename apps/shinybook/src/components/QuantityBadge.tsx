// Small "×N" chip that appears only when the user owns more than one copy
// of a painting. Rendered inline next to the status badge.

import { Box, Text } from "@gluestack-ui/themed";

import { palette } from "@/src/theme/colors";

interface Props {
  quantity: number | undefined;
}

export function QuantityBadge({ quantity }: Props) {
  const q = quantity ?? 1;
  if (q <= 1) return null;
  return (
    <Box
      bg={palette.surfaceAlt}
      borderRadius="$full"
      borderWidth={1}
      borderColor={palette.border}
      px="$2"
      py="$0.5"
    >
      <Text size="xs" color={palette.textMuted} fontWeight="$semibold">
        ×{q}
      </Text>
    </Box>
  );
}
