// Reusable drill form. Mirrors the PaintingForm shape — owns its state,
// validates, and calls onSubmit with a DB-ready partial.

import {
  Box,
  Button,
  ButtonText,
  HStack,
  Input,
  InputField,
  Textarea,
  TextareaInput,
  VStack,
} from "@gluestack-ui/themed";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";

import { palette } from "@/src/theme/colors";
import type { Drill } from "@/src/types/drill";

import { Field } from "./Field";
import { SegmentedControl } from "./SegmentedControl";

const SHAPE_OPTIONS: { id: Drill["shape"]; label: string }[] = [
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
  { id: "specialty", label: "Specialty" },
];

interface DrillFormValues {
  drillNumber: string;
  brand: string;
  shape: Drill["shape"];
  approximateCount: string;
  colorName: string;
  colorHex: string;
  notes: string;
}

interface DrillFormProps {
  initial?: Partial<Drill>;
  submitLabel?: string;
  onSubmit: (values: Partial<Drill>) => Promise<void> | void;
  onCancel?: () => void;
}

export function DrillForm({
  initial,
  submitLabel = "Save",
  onSubmit,
  onCancel,
}: DrillFormProps) {
  const [values, setValues] = useState<DrillFormValues>({
    drillNumber: initial?.drillNumber ?? "",
    brand: initial?.brand ?? "",
    shape: initial?.shape ?? "round",
    approximateCount: initial?.approximateCount?.toString() ?? "",
    colorName: initial?.colorName ?? "",
    colorHex: initial?.colorHex ?? "",
    notes: initial?.notes ?? "",
  });
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof DrillFormValues>(
    key: K,
    val: DrillFormValues[K]
  ) => setValues((v) => ({ ...v, [key]: val }));

  // Live swatch — accept short hex or longhand, prefix # if missing.
  const swatch = normalizeHex(values.colorHex);

  const handleSubmit = async () => {
    if (!values.drillNumber.trim() || !values.brand.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        drillNumber: values.drillNumber.trim(),
        brand: values.brand.trim(),
        shape: values.shape,
        approximateCount: parseIntOrZero(values.approximateCount),
        colorName: values.colorName.trim() || undefined,
        colorHex: swatch ?? undefined,
        notes: values.notes.trim() || undefined,
      });
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
        <VStack space="md">
          <HStack space="md">
            <Box flex={1}>
              <Field label="Drill number" required>
                <TextInput
                  value={values.drillNumber}
                  onChangeText={(t) => set("drillNumber", t)}
                  placeholder="e.g. 310"
                  autoCapitalize="characters"
                />
              </Field>
            </Box>
            <Box flex={1}>
              <Field label="Brand" required>
                <TextInput
                  value={values.brand}
                  onChangeText={(t) => set("brand", t)}
                  placeholder="DMC, DAC, Generic…"
                />
              </Field>
            </Box>
          </HStack>

          <Field label="Shape">
            <SegmentedControl
              options={SHAPE_OPTIONS}
              value={values.shape}
              onChange={(v) => set("shape", v)}
            />
          </Field>

          <Field label="Approximate count">
            <TextInput
              value={values.approximateCount}
              onChangeText={(t) =>
                set("approximateCount", t.replace(/[^0-9]/g, ""))
              }
              placeholder="0"
              keyboardType="number-pad"
            />
          </Field>

          <Field label="Color name">
            <TextInput
              value={values.colorName}
              onChangeText={(t) => set("colorName", t)}
              placeholder="e.g. Cardinal Red"
            />
          </Field>

          <Field label="Color hex" helper="Optional, for the swatch.">
            <HStack space="sm" alignItems="center">
              <Box flex={1}>
                <TextInput
                  value={values.colorHex}
                  onChangeText={(t) => set("colorHex", t)}
                  placeholder="#A21F1F"
                  autoCapitalize="characters"
                />
              </Box>
              <Box
                width={36}
                height={36}
                borderRadius="$full"
                bg={swatch ?? palette.surfaceAlt}
                borderWidth={1}
                borderColor={palette.border}
              />
            </HStack>
          </Field>

          <Field label="Notes">
            <TextAreaInput
              value={values.notes}
              onChangeText={(t) => set("notes", t)}
              placeholder="Anything to remember"
            />
          </Field>

          <HStack space="md" pt="$2">
            {onCancel ? (
              <Button
                flex={1}
                variant="outline"
                action="secondary"
                onPress={onCancel}
                isDisabled={submitting}
              >
                <ButtonText>Cancel</ButtonText>
              </Button>
            ) : null}
            <Button
              flex={1}
              bg={palette.purple}
              onPress={handleSubmit}
              isDisabled={
                submitting ||
                !values.drillNumber.trim() ||
                !values.brand.trim()
              }
            >
              <ButtonText>{submitting ? "Saving…" : submitLabel}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TextInput(props: React.ComponentProps<typeof InputField>) {
  return (
    <Input
      bg={palette.surface}
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

function TextAreaInput(props: React.ComponentProps<typeof TextareaInput>) {
  return (
    <Textarea
      bg={palette.surface}
      borderColor={palette.border}
      $focus-borderColor={palette.teal}
    >
      <TextareaInput
        color={palette.text}
        placeholderTextColor={palette.textSubtle}
        {...props}
      />
    </Textarea>
  );
}

function parseIntOrZero(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

// Accepts "A21F1F", "#A21F1F", "fff", "#fff". Returns canonical "#xxxxxx"
// (or "#xxx") with a leading hash, or null if it doesn't look like hex.
function normalizeHex(raw: string): string | null {
  const t = raw.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(t)) return null;
  if (t.length !== 3 && t.length !== 6) return null;
  return `#${t.toLowerCase()}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
