import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  Button,
  ButtonText,
  HStack,
  Heading,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Platform, ScrollView, StyleSheet } from "react-native";

import { EmptyState } from "@/src/components/EmptyState";
import { deleteDrill, getDrill, updateDrill } from "@/src/repo/drills";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import * as haptics from "@/src/lib/haptics";
import { palette } from "@/src/theme/colors";
import type { Drill } from "@/src/types/drill";

const SHAPE_LABEL: Record<Drill["shape"], string> = {
  round: "Round",
  square: "Square",
  specialty: "Specialty",
};

export default function DrillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: drill, loading, refresh } = useAsyncFocus(
    () => getDrill(id!),
    [id]
  );

  if (loading && !drill) {
    return (
      <Box flex={1} bg="$background0" alignItems="center" justifyContent="center">
        <Text color={palette.textMuted}>Loading…</Text>
      </Box>
    );
  }

  if (!drill) {
    return (
      <Box flex={1} bg="$background0">
        <EmptyState
          icon="alert-circle-outline"
          title="Drill not found"
          message="It may have been deleted."
          action={
            <Button onPress={() => router.back()} variant="outline">
              <ButtonText>Go back</ButtonText>
            </Button>
          }
        />
      </Box>
    );
  }

  const adjust = async (delta: number) => {
    haptics.tap();
    const next = Math.max(0, (drill.approximateCount ?? 0) + delta);
    await updateDrill(drill.id, { approximateCount: next });
    refresh();
  };

  const onDelete = () => {
    haptics.warning();
    confirm("Delete this drill?", "This cannot be undone.", async () => {
      await deleteDrill(drill.id);
      router.back();
    });
  };

  return (
    <Box flex={1} bg="$background0">
      <ScrollView contentContainerStyle={styles.content}>
        <VStack space="md" p="$4">
          <HStack space="md" alignItems="center">
            <Box
              width={64}
              height={64}
              borderRadius="$full"
              bg={drill.colorHex ?? palette.surfaceAlt}
              borderWidth={1}
              borderColor={palette.border}
            />
            <VStack flex={1} space="xs">
              <Heading size="xl" color={palette.text}>
                {drill.drillNumber}
              </Heading>
              <Text color={palette.textMuted}>
                {drill.brand}
                {drill.colorName ? ` · ${drill.colorName}` : ""}
              </Text>
              <HStack>
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
              </HStack>
            </VStack>
          </HStack>

          <Section title="Approximate count">
            <Box
              bg={palette.surface}
              borderRadius="$lg"
              borderWidth={1}
              borderColor={palette.border}
              p="$4"
            >
              <HStack alignItems="center" justifyContent="space-between">
                <CounterButton
                  icon="remove"
                  onPress={() => adjust(-10)}
                  label="-10"
                />
                <CounterButton
                  icon="remove-circle-outline"
                  onPress={() => adjust(-1)}
                />
                <Text color={palette.text} size="3xl" fontWeight="$bold">
                  ~{drill.approximateCount}
                </Text>
                <CounterButton
                  icon="add-circle-outline"
                  onPress={() => adjust(1)}
                />
                <CounterButton
                  icon="add"
                  onPress={() => adjust(10)}
                  label="+10"
                />
              </HStack>
            </Box>
          </Section>

          {drill.colorHex ? (
            <Section title="Hex">
              <Text color={palette.text} fontFamily="monospace">
                {drill.colorHex}
              </Text>
            </Section>
          ) : null}

          {drill.notes ? (
            <Section title="Notes">
              <Text color={palette.text}>{drill.notes}</Text>
            </Section>
          ) : null}

          <Button
            variant="outline"
            action="secondary"
            onPress={() => router.push(`/drill/${drill.id}/edit`)}
            mt="$2"
          >
            <ButtonText>Edit details</ButtonText>
          </Button>

          <Pressable
            onPress={onDelete}
            py="$3"
            alignItems="center"
            borderRadius="$md"
            $hover-bg={palette.surface}
          >
            <HStack space="xs" alignItems="center">
              <Ionicons name="trash-outline" size={16} color={palette.danger} />
              <Text color={palette.danger}>Delete drill</Text>
            </HStack>
          </Pressable>
        </VStack>
      </ScrollView>
    </Box>
  );
}

function CounterButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      px="$3"
      py="$2"
      borderRadius="$md"
      $hover-bg={palette.surfaceAlt}
    >
      <VStack alignItems="center" space="xs">
        <Ionicons name={icon} size={22} color={palette.teal} />
        {label ? (
          <Text size="xs" color={palette.textSubtle}>
            {label}
          </Text>
        ) : null}
      </VStack>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <VStack space="xs">
      <Text size="xs" color={palette.textSubtle} fontWeight="$semibold" style={{ letterSpacing: 1 }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </VStack>
  );
}

function confirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
});
