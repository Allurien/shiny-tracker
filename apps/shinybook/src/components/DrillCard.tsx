// Tappable list row for a Drill. Shows color swatch + drillNumber + brand
// + count + shape pill.

import { Box, HStack, Pressable, Text, VStack } from "@gluestack-ui/themed";
import { router } from "expo-router";

import { palette } from "@/src/theme/colors";
import type { Drill } from "@/src/types/drill";

const SHAPE_LABEL: Record<Drill["shape"], string> = {
  round: "Round",
  square: "Square",
  specialty: "Specialty",
};

export function DrillCard({ drill }: { drill: Drill }) {
  return (
    <Pressable
      onPress={() => router.push(`/drill/${drill.id}`)}
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={palette.border}
      px="$3"
      py="$3"
    >
      <HStack space="md" alignItems="center">
        <Box
          width={36}
          height={36}
          borderRadius="$full"
          bg={drill.colorHex ?? palette.surfaceAlt}
          borderWidth={1}
          borderColor={palette.border}
        />
        <VStack flex={1} space="xs">
          <Text color={palette.text} fontWeight="$semibold" numberOfLines={1}>
            {drill.drillNumber}
            {drill.colorName ? (
              <Text color={palette.textMuted}>{` · ${drill.colorName}`}</Text>
            ) : null}
          </Text>
          <Text size="sm" color={palette.textMuted} numberOfLines={1}>
            {drill.brand}
          </Text>
        </VStack>
        <VStack alignItems="flex-end" space="xs">
          <Text color={palette.text} fontWeight="$semibold">
            ~{drill.approximateCount}
          </Text>
          <Box
            px="$2"
            py="$0.5"
            borderRadius="$full"
            borderWidth={1}
            borderColor={palette.border}
          >
            <Text size="xs" color={palette.textSubtle}>
              {SHAPE_LABEL[drill.shape]}
            </Text>
          </Box>
        </VStack>
      </HStack>
    </Pressable>
  );
}
