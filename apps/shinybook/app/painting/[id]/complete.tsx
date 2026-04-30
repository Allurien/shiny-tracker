// Completion flow — capture rating + optional leftover drills, then mark
// painting completed. Leftover drills are upserted into inventory: same
// (brand, drillNumber) increments the count rather than duplicating.

import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  Button,
  ButtonText,
  HStack,
  Heading,
  Input,
  InputField,
  Pressable,
  Text,
  Textarea,
  TextareaInput,
  VStack,
} from "@gluestack-ui/themed";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";

import { Field } from "@/src/components/Field";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { nowIso } from "@/src/db/client";
import { upsertDrills } from "@/src/repo/drills";
import { getPainting, updatePainting } from "@/src/repo/paintings";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import * as haptics from "@/src/lib/haptics";
import { palette } from "@/src/theme/colors";
import type { Drill } from "@/src/types/drill";

interface LeftoverRow {
  drillNumber: string;
  brand: string;
  shape: Drill["shape"];
  count: string;
}

const SHAPE_OPTIONS: { id: Drill["shape"]; label: string }[] = [
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
  { id: "specialty", label: "Specialty" },
];

const emptyRow = (brand = ""): LeftoverRow => ({
  drillNumber: "",
  brand,
  shape: "round",
  count: "",
});

export default function CompletePaintingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: painting, loading } = useAsyncFocus(() => getPainting(id!), [id]);

  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LeftoverRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (loading && !painting) {
    return (
      <Box flex={1} bg="$background0" alignItems="center" justifyContent="center">
        <Text color={palette.textMuted}>Loading…</Text>
      </Box>
    );
  }
  if (!painting) {
    return (
      <Box flex={1} bg="$background0" alignItems="center" justifyContent="center">
        <Text color={palette.textMuted}>Painting not found.</Text>
      </Box>
    );
  }

  const defaultBrand = painting.brand ?? "";

  const addRow = () => setRows((r) => [...r, emptyRow(defaultBrand)]);
  const removeRow = (i: number) =>
    setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<LeftoverRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await updatePainting(painting.id, {
        status: "completed",
        completedAt: nowIso(),
        rating: rating || undefined,
        notes: notes.trim()
          ? painting.notes
            ? `${painting.notes}\n\n${notes.trim()}`
            : notes.trim()
          : painting.notes,
      });

      const valid = rows
        .map((r) => ({
          drillNumber: r.drillNumber.trim(),
          brand: r.brand.trim(),
          shape: r.shape,
          approximateCount: parseIntOrZero(r.count),
        }))
        .filter((r) => r.drillNumber && r.brand);
      if (valid.length) await upsertDrills(valid);

      haptics.success();
      // Replace so back goes to detail (now showing completed state).
      router.replace(`/painting/${painting.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <VStack space="lg">
          <VStack space="xs">
            <Heading size="lg" color={palette.text}>
              Mark complete
            </Heading>
            <Text color={palette.textMuted}>{painting.title}</Text>
          </VStack>

          <Field label="Rating">
            <HStack space="sm">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n === rating ? 0 : n)}>
                  <Ionicons
                    name={n <= rating ? "star" : "star-outline"}
                    size={36}
                    color={n <= rating ? palette.warning : palette.textSubtle}
                  />
                </Pressable>
              ))}
            </HStack>
          </Field>

          <Field label="Completion notes" helper="Appended to existing notes.">
            <Textarea
              bg={palette.surface}
              borderColor={palette.border}
              $focus-borderColor={palette.teal}
            >
              <TextareaInput
                color={palette.text}
                placeholderTextColor={palette.textSubtle}
                value={notes}
                onChangeText={setNotes}
                placeholder="How'd it go?"
              />
            </Textarea>
          </Field>

          <VStack space="sm">
            <HStack justifyContent="space-between" alignItems="center">
              <Text size="xs" color={palette.textSubtle} fontWeight="$semibold" style={{ letterSpacing: 1 }}>
                LEFTOVER DRILLS
              </Text>
              <Pressable onPress={addRow}>
                <HStack space="xs" alignItems="center">
                  <Ionicons name="add" size={16} color={palette.teal} />
                  <Text color={palette.teal} size="sm">Add row</Text>
                </HStack>
              </Pressable>
            </HStack>
            {rows.length === 0 ? (
              <Text color={palette.textSubtle} size="sm">
                Optional. Add rows to log what's left over for future projects.
              </Text>
            ) : null}
            {rows.map((row, i) => (
              <Box
                key={i}
                bg={palette.surface}
                borderRadius="$lg"
                borderWidth={1}
                borderColor={palette.border}
                p="$3"
              >
                <VStack space="sm">
                  <HStack space="sm">
                    <Box flex={1}>
                      <Field label="Number">
                        <RowInput
                          value={row.drillNumber}
                          onChangeText={(t) => updateRow(i, { drillNumber: t })}
                          placeholder="310"
                          autoCapitalize="characters"
                        />
                      </Field>
                    </Box>
                    <Box flex={1}>
                      <Field label="Brand">
                        <RowInput
                          value={row.brand}
                          onChangeText={(t) => updateRow(i, { brand: t })}
                          placeholder="DMC"
                        />
                      </Field>
                    </Box>
                    <Box width={88}>
                      <Field label="Count">
                        <RowInput
                          value={row.count}
                          onChangeText={(t) =>
                            updateRow(i, { count: t.replace(/[^0-9]/g, "") })
                          }
                          placeholder="0"
                          keyboardType="number-pad"
                        />
                      </Field>
                    </Box>
                  </HStack>
                  <HStack space="sm" alignItems="center" justifyContent="space-between">
                    <Box flex={1}>
                      <SegmentedControl
                        options={SHAPE_OPTIONS}
                        value={row.shape}
                        onChange={(v) => updateRow(i, { shape: v })}
                      />
                    </Box>
                    <Pressable onPress={() => removeRow(i)} px="$2">
                      <Ionicons name="trash-outline" size={18} color={palette.danger} />
                    </Pressable>
                  </HStack>
                </VStack>
              </Box>
            ))}
          </VStack>

          <HStack space="md" pt="$2">
            <Button
              flex={1}
              variant="outline"
              action="secondary"
              onPress={() => router.back()}
              isDisabled={submitting}
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button
              flex={1}
              bg={palette.purple}
              onPress={handleSubmit}
              isDisabled={submitting}
            >
              <ButtonText>{submitting ? "Saving…" : "Mark complete"}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RowInput(props: React.ComponentProps<typeof InputField>) {
  return (
    <Input
      bg={palette.bg}
      borderColor={palette.border}
      $focus-borderColor={palette.teal}
    >
      <InputField
        color={palette.text}
        placeholderTextColor={palette.textSubtle}
        {...props}
      />
    </Input>
  );
}

function parseIntOrZero(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
