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

import { lookupDmc } from "@/src/data/dmcColors";
import { palette } from "@/src/theme/colors";
import {
  DAC_SPECIALTY_PREFIXES,
  type Drill,
  type DrillSpecialtyType,
} from "@/src/types/drill";

import { DmcColorPicker } from "./DmcColorPicker";
import { Field } from "./Field";
import { SegmentedControl } from "./SegmentedControl";

type BrandKey = "dac" | "oraloa" | "other";

const BRAND_OPTIONS: { id: BrandKey; label: string }[] = [
  { id: "dac", label: "DAC" },
  { id: "oraloa", label: "Oraloa" },
  { id: "other", label: "Other" },
];

const SHAPE_OPTIONS: { id: "round" | "square"; label: string }[] = [
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
];

const SPECIALTY_BASE: { id: DrillSpecialtyType; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "ab", label: "AB" },
];

const SPECIALTY_DAC: { id: DrillSpecialtyType; label: string }[] = [
  ...SPECIALTY_BASE,
  { id: "fairy_dust", label: "Fairy Dust" },
  { id: "electro_diamond", label: "Electro ◆" },
];

function resolveBrandKey(brand: string): BrandKey {
  if (brand === "Diamond Art Club") return "dac";
  if (brand === "Oraloa") return "oraloa";
  return "other";
}

function brandFromKey(key: BrandKey, custom: string): string {
  if (key === "dac") return "Diamond Art Club";
  if (key === "oraloa") return "Oraloa";
  return custom.trim();
}

// For DAC drills stored with a prefix (AB310, Z310, L310), strip it back
// to the raw base number and recover the specialty type.
function stripDacPrefix(drillNumber: string): { base: string; specialtyType: DrillSpecialtyType } {
  if (drillNumber.startsWith("AB")) return { base: drillNumber.slice(2), specialtyType: "ab" };
  if (drillNumber.startsWith("Z")) return { base: drillNumber.slice(1), specialtyType: "fairy_dust" };
  if (drillNumber.startsWith("L")) return { base: drillNumber.slice(1), specialtyType: "electro_diamond" };
  return { base: drillNumber, specialtyType: "standard" };
}

interface DrillFormValues {
  baseNumber: string;
  brandKey: BrandKey;
  customBrand: string;
  shape: "round" | "square";
  specialtyType: DrillSpecialtyType;
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
  const initBrandKey = resolveBrandKey(initial?.brand ?? "");
  const { base: initBase, specialtyType: detectedSpecialty } =
    initBrandKey === "dac" && initial?.drillNumber
      ? stripDacPrefix(initial.drillNumber)
      : { base: initial?.drillNumber ?? "", specialtyType: (initial?.specialtyType ?? "standard") as DrillSpecialtyType };

  const [values, setValues] = useState<DrillFormValues>({
    baseNumber: initBase,
    brandKey: initBrandKey,
    customBrand: initBrandKey === "other" ? (initial?.brand ?? "") : "",
    shape: initial?.shape === "specialty" || !initial?.shape ? "round" : initial.shape,
    specialtyType: initial?.specialtyType ?? detectedSpecialty,
    approximateCount: initial?.approximateCount?.toString() ?? "",
    colorName: initial?.colorName ?? "",
    colorHex: initial?.colorHex ?? "",
    notes: initial?.notes ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const set = <K extends keyof DrillFormValues>(key: K, val: DrillFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const specialtyOptions = values.brandKey === "dac" ? SPECIALTY_DAC : SPECIALTY_BASE;

  const handleBrandChange = (key: BrandKey) => {
    setValues((v) => ({
      ...v,
      brandKey: key,
      // Clamp DAC-only specialty types when switching away from DAC
      specialtyType:
        key !== "dac" &&
        (v.specialtyType === "fairy_dust" || v.specialtyType === "electro_diamond")
          ? "standard"
          : v.specialtyType,
    }));
  };

  // Try DMC lookup when drill number changes; auto-fill empty color fields.
  const handleNumberChange = (text: string) => {
    const found = lookupDmc(text.trim());
    setValues((v) => ({
      ...v,
      baseNumber: text,
      colorName: found && !v.colorName ? found.name : v.colorName,
      colorHex: found && !v.colorHex ? found.hex : v.colorHex,
    }));
  };

  const swatch = normalizeHex(values.colorHex);

  const prefix =
    values.brandKey === "dac" ? DAC_SPECIALTY_PREFIXES[values.specialtyType] : "";
  const compiledNumber = prefix + values.baseNumber.trim();
  const showCompiledHint = !!prefix && !!values.baseNumber.trim();

  const brand = brandFromKey(values.brandKey, values.customBrand);
  const canSubmit = !submitting && !!values.baseNumber.trim() && !!brand;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        drillNumber: compiledNumber,
        brand,
        shape: values.shape,
        specialtyType: values.specialtyType,
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
          <Field label="Brand" required>
            <SegmentedControl
              options={BRAND_OPTIONS}
              value={values.brandKey}
              onChange={handleBrandChange}
            />
          </Field>

          {values.brandKey === "other" && (
            <Field label="Brand name" required>
              <TextInput
                value={values.customBrand}
                onChangeText={(t) => set("customBrand", t)}
                placeholder="Enter brand name"
              />
            </Field>
          )}

          <Field
            label="Drill number"
            required
            helper={showCompiledHint ? `Stored as: ${compiledNumber}` : undefined}
          >
            <TextInput
              value={values.baseNumber}
              onChangeText={handleNumberChange}
              placeholder="e.g. 310"
              autoCapitalize="characters"
            />
          </Field>

          <Field label="Shape">
            <SegmentedControl
              options={SHAPE_OPTIONS}
              value={values.shape}
              onChange={(v) => set("shape", v)}
            />
          </Field>

          <Field label="Finish">
            <SegmentedControl
              options={specialtyOptions}
              value={values.specialtyType}
              onChange={(v) => set("specialtyType", v)}
            />
          </Field>

          <Field label="Approximate count">
            <TextInput
              value={values.approximateCount}
              onChangeText={(t) => set("approximateCount", t.replace(/[^0-9]/g, ""))}
              placeholder="0"
              keyboardType="number-pad"
            />
          </Field>

          <Field label="Color name">
            <VStack space="xs">
              <TextInput
                value={values.colorName}
                onChangeText={(t) => set("colorName", t)}
                placeholder="e.g. Cardinal Red"
              />
              <Pressable
                onPress={() => setPickerOpen(true)}
                py="$1.5"
                px="$3"
                borderRadius="$md"
                borderWidth={1}
                borderColor={palette.teal}
                alignSelf="flex-start"
              >
                <Text size="xs" color={palette.teal}>
                  Browse DMC colors
                </Text>
              </Pressable>
            </VStack>
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
              isDisabled={!canSubmit}
            >
              <ButtonText>{submitting ? "Saving…" : submitLabel}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </ScrollView>

      <DmcColorPicker
        visible={pickerOpen}
        selectedHex={normalizeHex(values.colorHex) ?? undefined}
        onSelect={(entry) => {
          setValues((v) => ({
            ...v,
            baseNumber: entry.number,
            colorName: entry.name,
            colorHex: entry.hex,
          }));
        }}
        onClose={() => setPickerOpen(false)}
      />
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
