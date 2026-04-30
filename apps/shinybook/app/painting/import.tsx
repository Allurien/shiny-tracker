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
  VStack,
} from "@gluestack-ui/themed";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";

import { Field } from "@/src/components/Field";
import { PhotoImage } from "@/src/components/PhotoImage";
import {
  SegmentedControl,
  type SegmentOption,
} from "@/src/components/SegmentedControl";
import { nowIso } from "@/src/db/client";
import {
  createPainting,
  findDuplicate,
  incrementQuantity,
} from "@/src/repo/paintings";
import { findWishlistScraper, scrapeProduct } from "@/src/scrapers";
import { confirm } from "@/src/lib/confirm";
import { palette } from "@/src/theme/colors";
import type {
  Painting,
  PaintingStatus,
  ScrapedPainting,
} from "@/src/types/painting";

type SaveAs = "wishlist" | "ordered" | "stash" | "in_progress";

const SAVE_AS_OPTIONS: SegmentOption<SaveAs>[] = [
  { id: "wishlist", label: "Wish" },
  { id: "ordered", label: "Ordered" },
  { id: "stash", label: "Stash" },
  { id: "in_progress", label: "WIP" },
];

export default function ImportPaintingScreen() {
  // Optional ?url= prefill (used by Re-import on the detail screen).
  const { url: prefilledUrl } = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(prefilledUrl ?? "");
  const [preview, setPreview] = useState<ScrapedPainting | null>(null);
  const [status, setStatus] = useState<SaveAs>("stash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // If we landed here with a prefilled URL, auto-run the preview so the
  // user can immediately confirm the re-import.
  useEffect(() => {
    if (prefilledUrl) void runPreview(prefilledUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledUrl]);

  async function runPreview(target?: string) {
    const u = (target ?? url).trim();
    if (!u) return;
    // Bulk wishlist URLs aren't single products — bounce to the wishlist
    // import flow instead of throwing the unhelpful "no scraper" error.
    if (findWishlistScraper(u)) {
      router.replace({
        pathname: "/painting/wishlist-import",
        params: { url: u },
      } as never);
      return;
    }
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await scrapeProduct(u);
      setPreview(result);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    try {
      const existing = await findDuplicate({
        sourceUrl: preview.sourceUrl,
        title: preview.title,
        brand: preview.brand,
      });
      if (existing) {
        const shouldAddCopy = await confirm({
          title: "Already in your collection",
          message: `You've already registered "${existing.title}". Add another copy to your stash?`,
          confirmLabel: "Add copy",
        });
        if (!shouldAddCopy) return;
        await incrementQuantity(existing.id);
        router.replace(`/painting/${existing.id}`);
        return;
      }
      const created = await createPainting(
        withLifecycleDate({
          ...preview,
          status,
        })
      );
      router.replace(`/painting/${created.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <VStack space="md">
          <Heading color={palette.text}>Import from URL</Heading>
          <Text color={palette.textMuted}>
            Paste a Diamond Art Club, Oraloa, or Amazon product URL. The page
            is fetched and details are pre-filled — review before saving.
          </Text>

          <Field label="Product URL">
            <Input
              bg={palette.surface}
              borderColor={palette.border}
              $focus-borderColor={palette.teal}
            >
              <InputField
                color={palette.text}
                placeholderTextColor={palette.textSubtle}
                placeholder="https://www.diamondartclub.com/products/… or amazon.com/dp/…"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => runPreview()}
              />
            </Input>
          </Field>

          <Button
            bg={palette.teal}
            onPress={() => runPreview()}
            isDisabled={loading || !url.trim()}
          >
            <ButtonText>{loading ? "Fetching…" : "Preview"}</ButtonText>
          </Button>

          {error ? (
            <Box
              bg={`${palette.danger}15`}
              borderRadius="$md"
              borderWidth={1}
              borderColor={palette.danger}
              p="$3"
            >
              <Text color={palette.danger}>{error}</Text>
            </Box>
          ) : null}

          {preview ? (
            <PreviewCard preview={preview}>
              <Field label="Save as">
                <SegmentedControl
                  options={SAVE_AS_OPTIONS}
                  value={status}
                  onChange={setStatus}
                />
              </Field>
              <Button
                bg={palette.purple}
                onPress={save}
                isDisabled={saving}
                mt="$2"
              >
                <ButtonText>
                  {saving ? "Saving…" : "Save to ShinyBook"}
                </ButtonText>
              </Button>
            </PreviewCard>
          ) : null}

          <Pressable
            onPress={() => router.push("/discover/dac-archived" as never)}
            py="$2"
            alignItems="center"
          >
            <HStack space="xs" alignItems="center">
              <Ionicons
                name="archive-outline"
                size={16}
                color={palette.teal}
              />
              <Text color={palette.teal}>Browse DAC archived kits</Text>
            </HStack>
          </Pressable>

          <Pressable
            onPress={() => router.replace("/painting/new")}
            py="$2"
            alignItems="center"
          >
            <HStack space="xs" alignItems="center">
              <Ionicons
                name="create-outline"
                size={16}
                color={palette.textMuted}
              />
              <Text color={palette.textMuted}>Add manually instead</Text>
            </HStack>
          </Pressable>
        </VStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PreviewCard({
  preview,
  children,
}: {
  preview: ScrapedPainting;
  children: React.ReactNode;
}) {
  const specs: { label: string; value: string }[] = [];
  if (preview.canvasSize) specs.push({ label: "Canvas", value: preview.canvasSize });
  if (preview.drillShape && preview.drillShape !== "unknown") {
    specs.push({ label: "Drill shape", value: cap(preview.drillShape) });
  }
  if (preview.drillCount) {
    specs.push({ label: "Drills", value: preview.drillCount.toLocaleString() });
  }
  if (preview.colorCount) {
    specs.push({ label: "Colors", value: String(preview.colorCount) });
  }
  if (preview.price) {
    specs.push({
      label: "Price",
      value: `${preview.currency ?? ""}${preview.price.toFixed(2)}`,
    });
  }

  return (
    <VStack
      space="md"
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={palette.border}
      overflow="hidden"
    >
      {preview.coverImage ? (
        <PhotoImage
          photoRef={preview.coverImage}
          style={styles.previewImage}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <VStack space="md" p="$3">
        <VStack space="xs">
          <Heading size="md" color={palette.text}>
            {preview.title}
          </Heading>
          {preview.brand || preview.artist ? (
            <Text color={palette.textMuted}>
              {[preview.brand, preview.artist].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </VStack>
        {specs.length > 0 ? (
          <HStack space="sm" flexWrap="wrap">
            {specs.map((s) => (
              <Box
                key={s.label}
                bg={palette.surfaceAlt}
                borderRadius="$md"
                px="$2.5"
                py="$1.5"
              >
                <Text size="xs" color={palette.textSubtle}>
                  {s.label.toUpperCase()}
                </Text>
                <Text color={palette.text} fontWeight="$semibold">
                  {s.value}
                </Text>
              </Box>
            ))}
          </HStack>
        ) : null}
        {children}
      </VStack>
    </VStack>
  );
}

function withLifecycleDate(input: ScrapedPainting & { status: PaintingStatus }): Omit<
  Painting,
  "id" | "createdAt" | "updatedAt"
> {
  const now = nowIso();
  const base = { ...input } as Omit<Painting, "id" | "createdAt" | "updatedAt">;
  switch (input.status) {
    case "ordered":
      return { ...base, purchasedAt: now };
    case "stash":
      return { ...base, receivedAt: now };
    case "in_progress":
      return { ...base, startedAt: now };
    case "completed":
      return { ...base, completedAt: now };
    default:
      return base;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 16, paddingBottom: 32 },
  previewImage: { width: "100%", height: 200 },
});
