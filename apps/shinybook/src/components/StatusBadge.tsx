// Compact pill that color-codes a painting's status.

import { Box, Text } from "@gluestack-ui/themed";

import { palette } from "@/src/theme/colors";
import type { PaintingStatus } from "@/src/types/painting";

const LABELS: Record<PaintingStatus, string> = {
  wishlist: "Wishlist",
  ordered: "Ordered",
  stash: "Stash",
  in_progress: "In progress",
  completed: "Completed",
};

const COLORS: Record<PaintingStatus, string> = {
  wishlist: palette.status.wishlist,
  ordered: palette.status.ordered,
  stash: palette.status.stash,
  in_progress: palette.status.inProgress,
  completed: palette.status.completed,
};

export function StatusBadge({ status }: { status: PaintingStatus }) {
  const color = COLORS[status];
  return (
    <Box
      px="$2"
      py="$0.5"
      borderRadius="$full"
      borderWidth={1}
      borderColor={color}
      bg={`${color}22`}
    >
      <Text size="xs" color={color} fontWeight="$semibold">
        {LABELS[status]}
      </Text>
    </Box>
  );
}
