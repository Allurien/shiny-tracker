// Center-aligned empty-state block. Optional CTA renders below the message.

import { Ionicons } from "@expo/vector-icons";
import { Box, Heading, Text, VStack } from "@gluestack-ui/themed";
import type { ReactNode } from "react";

import { palette } from "@/src/theme/colors";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({
  icon = "sparkles-outline",
  title,
  message,
  action,
}: EmptyStateProps) {
  return (
    <Box flex={1} alignItems="center" justifyContent="center" px="$6" py="$8">
      <VStack space="md" alignItems="center" maxWidth={320}>
        <Ionicons name={icon} size={48} color={palette.textSubtle} />
        <Heading size="md" color={palette.text} textAlign="center">
          {title}
        </Heading>
        <Text color={palette.textMuted} textAlign="center">
          {message}
        </Text>
        {action}
      </VStack>
    </Box>
  );
}
