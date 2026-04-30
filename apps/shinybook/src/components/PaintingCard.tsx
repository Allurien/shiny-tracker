// Tappable list row for a Painting. Handles cover image + title + brand
// + status badge + an optional secondary line (e.g. "12.4h logged").

import { Box, HStack, Pressable, Text, VStack } from "@gluestack-ui/themed";
import { router } from "expo-router";

import { palette } from "@/src/theme/colors";
import type { Painting } from "@/src/types/painting";

import { DrillShapeIcon } from "./DrillShapeIcon";
import { PhotoImage } from "./PhotoImage";
import { QuantityBadge } from "./QuantityBadge";
import { StatusBadge } from "./StatusBadge";

interface PaintingCardProps {
  painting: Painting;
  secondaryLine?: string;
}

export function PaintingCard({ painting, secondaryLine }: PaintingCardProps) {
  return (
    <Pressable
      onPress={() => router.push(`/painting/${painting.id}`)}
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={palette.border}
      overflow="hidden"
    >
      <HStack space="md">
        <Box width={88} height={88} bg={palette.surfaceAlt}>
          {painting.coverImage ? (
            <PhotoImage
              photoRef={painting.coverImage}
              style={{ width: 88, height: 88 }}
              contentFit="cover"
              transition={150}
            />
          ) : null}
        </Box>
        <VStack flex={1} py="$2.5" pr="$3" space="xs" justifyContent="center">
          <Text
            color={palette.text}
            fontWeight="$semibold"
            numberOfLines={1}
          >
            {painting.title}
          </Text>
          {painting.artist || painting.brand ? (
            <Text size="sm" color={palette.textMuted} numberOfLines={1}>
              {[painting.artist, painting.brand].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
          <HStack space="sm" alignItems="center" flexWrap="wrap">
            <StatusBadge status={painting.status} />
            <QuantityBadge quantity={painting.quantity} />
            <DrillShapeIcon shape={painting.drillShape} />
            {secondaryLine ? (
              <Text size="xs" color={palette.textSubtle}>
                {secondaryLine}
              </Text>
            ) : null}
          </HStack>
        </VStack>
      </HStack>
    </Pressable>
  );
}
