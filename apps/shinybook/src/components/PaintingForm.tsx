// Reusable form for create + edit. Owns input state internally; calls
// onSubmit with a fully-shaped patch ready to hand to the DB layer.

import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  Button,
  ButtonText,
  HStack,
  Input,
  InputField,
  Pressable,
  Text,
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
import type {
  DrillShape,
  Painting,
  PaintingSource,
  PaintingStatus,
} from "@/src/types/painting";

import { Field } from "./Field";
import { SegmentedControl } from "./SegmentedControl";

export interface PaintingFormValues {
  title: string;
  brand: string;
  artist: string;
  status: PaintingStatus;
  source: PaintingSource;
  isEvent: boolean;
  eventName: string;
  canvasSize: string;
  drillShape: Exclude<DrillShape, "unknown">;
  drillCount: string;
  colorCount: string;
  price: string;
  currency: string;
  description: string;
  notes: string;
}

interface PaintingFormProps {
  initial?: Partial<Painting>;
  submitLabel?: string;
  onSubmit: (values: Partial<Painting>) => Promise<void> | void;
  onCancel?: () => void;
}

const STATUS_OPTIONS: { id: PaintingStatus; label: string }[] = [
  { id: "wishlist", label: "Wish" },
  { id: "ordered", label: "Ordered" },
  { id: "stash", label: "Stash" },
  { id: "in_progress", label: "WIP" },
  { id: "completed", label: "Done" },
];

const SHAPE_OPTIONS: { id: Exclude<DrillShape, "unknown">; label: string }[] = [
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
  { id: "specialty", label: "Specialty" },
];

const SOURCE_OPTIONS: { id: PaintingSource; label: string }[] = [
  { id: "purchase", label: "Purchase" },
  { id: "destash", label: "Destash" },
];

export function PaintingForm({
  initial,
  submitLabel = "Save",
  onSubmit,
  onCancel,
}: PaintingFormProps) {
  const [values, setValues] = useState<PaintingFormValues>({
    title: initial?.title ?? "",
    brand: initial?.brand ?? "",
    artist: initial?.artist ?? "",
    status: initial?.status ?? "stash",
    source: initial?.source ?? "purchase",
    isEvent: !!initial?.eventName,
    eventName: initial?.eventName ?? "",
    canvasSize: initial?.canvasSize ?? "",
    drillShape:
      initial?.drillShape && initial.drillShape !== "unknown"
        ? initial.drillShape
        : "round",
    drillCount: initial?.drillCount?.toString() ?? "",
    colorCount: initial?.colorCount?.toString() ?? "",
    price: initial?.price?.toString() ?? "",
    currency: initial?.currency ?? "$",
    description: initial?.description ?? "",
    notes: initial?.notes ?? "",
  });
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof PaintingFormValues>(
    key: K,
    val: PaintingFormValues[K]
  ) => setValues((v) => ({ ...v, [key]: val }));

  const handleSubmit = async () => {
    if (!values.title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: values.title.trim(),
        brand: values.brand.trim() || undefined,
        artist: values.artist.trim() || undefined,
        status: values.status,
        source: values.source,
        eventName:
          values.isEvent && values.eventName.trim()
            ? values.eventName.trim()
            : undefined,
        canvasSize: values.canvasSize.trim() || undefined,
        drillShape: values.drillShape,
        drillCount: parseIntOrUndef(values.drillCount),
        colorCount: parseIntOrUndef(values.colorCount),
        price: parseFloatOrUndef(values.price),
        currency: values.price ? values.currency : undefined,
        description: values.description.trim() || undefined,
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
          <Field label="Title" required>
            <TextInput
              value={values.title}
              onChangeText={(t) => set("title", t)}
              placeholder="e.g. Uranus"
            />
          </Field>

          <HStack space="md">
            <Box flex={1}>
              <Field label="Brand">
                <TextInput
                  value={values.brand}
                  onChangeText={(t) => set("brand", t)}
                  placeholder="Diamond Art Club"
                />
              </Field>
            </Box>
            <Box flex={1}>
              <Field label="Artist">
                <TextInput
                  value={values.artist}
                  onChangeText={(t) => set("artist", t)}
                  placeholder="Artist name"
                />
              </Field>
            </Box>
          </HStack>

          <Field label="Status">
            <SegmentedControl
              options={STATUS_OPTIONS}
              value={values.status}
              onChange={(v) => set("status", v)}
            />
          </Field>

          <Field label="Source">
            <SegmentedControl
              options={SOURCE_OPTIONS}
              value={values.source}
              onChange={(v) => set("source", v)}
            />
          </Field>

          <VStack space="xs">
            <Checkbox
              checked={values.isEvent}
              label="Event"
              onChange={(checked) => set("isEvent", checked)}
            />
            {values.isEvent ? (
              <TextInput
                value={values.eventName}
                onChangeText={(t) => set("eventName", t)}
                placeholder="Event name (e.g. DAC Anniversary 2025)"
              />
            ) : null}
          </VStack>

          <Field label="Drill shape">
            <SegmentedControl
              options={SHAPE_OPTIONS}
              value={values.drillShape}
              onChange={(v) => set("drillShape", v)}
            />
          </Field>

          <Field label="Canvas size">
            <TextInput
              value={values.canvasSize}
              onChangeText={(t) => set("canvasSize", t)}
              placeholder='e.g. 18" x 24"'
            />
          </Field>

          <HStack space="md">
            <Box flex={1}>
              <Field label="Drill count">
                <TextInput
                  value={values.drillCount}
                  onChangeText={(t) => set("drillCount", t.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </Field>
            </Box>
            <Box flex={1}>
              <Field label="Colors">
                <TextInput
                  value={values.colorCount}
                  onChangeText={(t) => set("colorCount", t.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </Field>
            </Box>
          </HStack>

          <HStack space="md">
            <Box flex={2}>
              <Field label="Price">
                <TextInput
                  value={values.price}
                  onChangeText={(t) =>
                    set("price", t.replace(/[^0-9.]/g, ""))
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </Field>
            </Box>
            <Box flex={1}>
              <Field label="Currency">
                <TextInput
                  value={values.currency}
                  onChangeText={(t) => set("currency", t)}
                  placeholder="$"
                />
              </Field>
            </Box>
          </HStack>

          <Field label="Description">
            <TextAreaInput
              value={values.description}
              onChangeText={(t) => set("description", t)}
              placeholder="From the brand listing or your own notes"
            />
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
              isDisabled={submitting || !values.title.trim()}
            >
              <ButtonText>{submitting ? "Saving…" : submitLabel}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Inline checkbox built from Pressable + Ionicons (gluestack's themed
// Checkbox isn't bundled in this app's preset).
function Checkbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Pressable onPress={() => onChange(!checked)} py="$1">
      <HStack space="sm" alignItems="center">
        <Box
          w={20}
          h={20}
          borderRadius="$sm"
          borderWidth={1}
          borderColor={checked ? palette.teal : palette.border}
          bg={checked ? palette.teal : "transparent"}
          alignItems="center"
          justifyContent="center"
        >
          {checked ? (
            <Ionicons name="checkmark" size={14} color={palette.text} />
          ) : null}
        </Box>
        <Text color={palette.text}>{label}</Text>
      </HStack>
    </Pressable>
  );
}

// Thin wrappers around Gluestack's Input/Textarea to apply consistent palette.
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

function parseIntOrUndef(s: string): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseFloatOrUndef(s: string): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
