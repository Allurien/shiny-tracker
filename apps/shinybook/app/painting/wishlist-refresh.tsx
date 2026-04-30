// Refresh a tracked DAC wishlist source. Re-scrapes the same share URL the
// user pasted at import time, diffs the result against the source's last
// snapshot + the user's current "wishlist" paintings, and presents an inline
// review:
//   - Items new on DAC, missing locally → user picks which to import
//   - Items in user's wishlist but no longer on DAC → user picks which to delete
//
// Removal proposals are scoped to paintings still in status="wishlist". If
// the user has already promoted an item (ordered/stash/etc.), it's left
// alone — that's intentional curation, not stale data.

import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  Button,
  ButtonText,
  Heading,
  HStack,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet } from "react-native";

import { wishlistSourcesApi } from "@/src/api";
import {
  createPainting,
  deletePainting,
  findDuplicate,
  listPaintings,
} from "@/src/repo/paintings";
import { scrapeProduct } from "@/src/scrapers";
import { palette } from "@/src/theme/colors";
import type { Painting } from "@/src/types/painting";
import {
  WishlistScraperView,
  handleFromProductUrl,
  type ScrapedItem,
} from "@/src/wishlist/scraper";

type Phase =
  | { kind: "loading" }
  | { kind: "scraping"; sourceUrl: string }
  | {
      kind: "review";
      sourceId: string;
      sourceUrl: string;
      origin: string;
      scrapedItems: ScrapedItem[];
      adds: ScrapedItem[];
      addsSelected: Set<string>;
      removes: { painting: Painting; handle: string }[];
      removesSelected: Set<string>;
    }
  | { kind: "applying"; addsTotal: number; addsDone: number; removesTotal: number; removesDone: number }
  | { kind: "done"; addsImported: number; removesDeleted: number }
  | { kind: "error"; message: string };

export default function WishlistRefreshScreen() {
  if (Platform.OS === "web") {
    return (
      <Box flex={1} bg="$background0" p="$4" justifyContent="center">
        <VStack space="md" alignItems="center">
          <Ionicons
            name="phone-portrait-outline"
            size={48}
            color={palette.textSubtle}
          />
          <Heading color={palette.text} textAlign="center">
            Native-only feature
          </Heading>
          <Text color={palette.textMuted} textAlign="center">
            Refreshing a wishlist re-runs the import scraper, which only works
            in the iOS / Android app.
          </Text>
          <Button
            variant="outline"
            action="secondary"
            onPress={() => router.back()}
            mt="$2"
          >
            <ButtonText>Go back</ButtonText>
          </Button>
        </VStack>
      </Box>
    );
  }
  return <NativeWishlistRefresh />;
}

function NativeWishlistRefresh() {
  const params = useLocalSearchParams<{ id?: string }>();
  const sourceId = params.id;
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  // Load the source row + the user's current wishlist paintings, then mount
  // the scraper. Combined into one effect to keep ordering deterministic.
  useEffect(() => {
    if (!sourceId) {
      setPhase({ kind: "error", message: "Missing wishlist id" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sources = await wishlistSourcesApi.listSources();
        const source = sources.find((s) => s.id === sourceId);
        if (!source) {
          if (!cancelled) {
            setPhase({
              kind: "error",
              message: "Wishlist source not found. It may have been deleted.",
            });
          }
          return;
        }
        if (cancelled) return;
        setPhase({ kind: "scraping", sourceUrl: source.url });
      } catch (err) {
        if (!cancelled) {
          setPhase({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to load source",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  const onScrapeResult = useCallback(
    async (items: ScrapedItem[]) => {
      if (!sourceId) return;
      try {
        const sources = await wishlistSourcesApi.listSources();
        const source = sources.find((s) => s.id === sourceId);
        if (!source) {
          setPhase({
            kind: "error",
            message: "Wishlist source not found.",
          });
          return;
        }

        const scrapedHandles = new Set(items.map((i) => i.handle));
        const snapshot = new Set(source.snapshotHandles);

        // New on DAC → not previously snapshotted. Filter by "not already in
        // user's collection" so a re-add of a promoted painting doesn't keep
        // re-prompting.
        const wishlistPaintings = await listPaintings({ status: "wishlist" });
        const newCandidates = items.filter((i) => !snapshot.has(i.handle));
        const adds: ScrapedItem[] = [];
        for (const candidate of newCandidates) {
          // Quick-deduplicate against the user's full collection by sourceUrl
          // before showing in the modal — saves a confusing "already added".
          const candidateUrl = `${new URL(source.url).origin}/products/${candidate.handle}`;
          const dup = await findDuplicate({
            sourceUrl: candidateUrl,
            title: candidate.title,
          });
          if (!dup) adds.push(candidate);
        }

        // Removed from DAC → previously snapshotted, missing now. Scope to
        // paintings still in "wishlist"; promoted items aren't candidates.
        const removes: { painting: Painting; handle: string }[] = [];
        for (const p of wishlistPaintings) {
          const handle = handleFromProductUrl(p.sourceUrl);
          if (!handle) continue;
          if (snapshot.has(handle) && !scrapedHandles.has(handle)) {
            removes.push({ painting: p, handle });
          }
        }

        setPhase({
          kind: "review",
          sourceId: source.id,
          sourceUrl: source.url,
          origin: new URL(source.url).origin,
          scrapedItems: items,
          adds,
          addsSelected: new Set(adds.map((a) => a.handle)),
          removes,
          removesSelected: new Set(removes.map((r) => r.handle)),
        });
      } catch (err) {
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to compute diff",
        });
      }
    },
    [sourceId],
  );

  const onScrapeEmpty = useCallback(() => {
    setPhase({
      kind: "error",
      message:
        "Couldn't read the wishlist. The DAC share URL may have expired — re-share from DAC and import fresh.",
    });
  }, []);

  async function applyChanges() {
    if (phase.kind !== "review") return;
    const addsToImport = phase.adds.filter((a) =>
      phase.addsSelected.has(a.handle),
    );
    const removesToDelete = phase.removes.filter((r) =>
      phase.removesSelected.has(r.handle),
    );
    setPhase({
      kind: "applying",
      addsTotal: addsToImport.length,
      addsDone: 0,
      removesTotal: removesToDelete.length,
      removesDone: 0,
    });

    let addsDone = 0;
    let removesDone = 0;
    for (const a of addsToImport) {
      try {
        const productUrl = `${phase.origin}/products/${a.handle}`;
        const scraped = await scrapeProduct(productUrl);
        const dup = await findDuplicate({
          sourceUrl: scraped.sourceUrl,
          title: scraped.title,
          brand: scraped.brand,
        });
        if (!dup) {
          await createPainting({ ...scraped, status: "wishlist" });
        }
      } catch {
        // Non-fatal — partial failures shouldn't block other items.
      } finally {
        addsDone++;
        setPhase({
          kind: "applying",
          addsTotal: addsToImport.length,
          addsDone,
          removesTotal: removesToDelete.length,
          removesDone,
        });
      }
    }

    for (const r of removesToDelete) {
      try {
        await deletePainting(r.painting.id);
      } catch {
        // Non-fatal.
      } finally {
        removesDone++;
        setPhase({
          kind: "applying",
          addsTotal: addsToImport.length,
          addsDone,
          removesTotal: removesToDelete.length,
          removesDone,
        });
      }
    }

    // Update the source snapshot to whatever DAC currently shows. This is
    // what the next refresh will diff against — using the post-apply state
    // means already-reviewed deltas don't re-surface.
    try {
      await wishlistSourcesApi.patchSource(phase.sourceId, {
        snapshotHandles: phase.scrapedItems.map((i) => i.handle),
      });
    } catch (err) {
      console.warn("[wishlist-refresh] snapshot update failed", err);
    }

    setPhase({
      kind: "done",
      addsImported: addsDone,
      removesDeleted: removesDone,
    });
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <VStack space="md">
        <Heading color={palette.text}>Refresh wishlist</Heading>

        {phase.kind === "loading" || phase.kind === "scraping" ? (
          <VStack space="sm" alignItems="center" py="$10">
            <Text color={palette.textMuted}>Re-scraping your DAC wishlist…</Text>
            <Text size="xs" color={palette.textSubtle} textAlign="center">
              This can take 5-15 seconds depending on how fast Swym responds.
            </Text>
          </VStack>
        ) : null}

        {phase.kind === "error" ? (
          <Box
            bg={`${palette.danger}15`}
            borderRadius="$md"
            borderWidth={1}
            borderColor={palette.danger}
            p="$3"
          >
            <Text color={palette.danger} size="sm">
              {phase.message}
            </Text>
          </Box>
        ) : null}

        {phase.kind === "review" ? (
          <ReviewSection
            phase={phase}
            onAddToggle={(handle) =>
              setPhase((p) =>
                p.kind === "review" ? toggleSet(p, "addsSelected", handle) : p,
              )
            }
            onRemoveToggle={(handle) =>
              setPhase((p) =>
                p.kind === "review"
                  ? toggleSet(p, "removesSelected", handle)
                  : p,
              )
            }
            onConfirm={applyChanges}
          />
        ) : null}

        {phase.kind === "applying" ? (
          <VStack space="sm" alignItems="center" py="$10">
            <Text color={palette.textMuted}>
              Importing {phase.addsDone} / {phase.addsTotal}, removing{" "}
              {phase.removesDone} / {phase.removesTotal}…
            </Text>
          </VStack>
        ) : null}

        {phase.kind === "done" ? (
          <VStack space="md" alignItems="center" py="$10">
            <Ionicons
              name="checkmark-circle"
              size={48}
              color={palette.success}
            />
            <Text color={palette.text} fontWeight="$semibold" textAlign="center">
              Imported {phase.addsImported}, removed {phase.removesDeleted}
            </Text>
            <Button bg={palette.purple} onPress={() => router.back()}>
              <ButtonText>Done</ButtonText>
            </Button>
          </VStack>
        ) : null}
      </VStack>

      {phase.kind === "scraping" ? (
        <WishlistScraperView
          url={phase.sourceUrl}
          onResult={(r) =>
            r.items.length > 0 ? onScrapeResult(r.items) : onScrapeEmpty()
          }
          onParseError={() =>
            setPhase({
              kind: "error",
              message: "Couldn't parse the scraper response.",
            })
          }
        />
      ) : null}
    </ScrollView>
  );
}

function toggleSet<P extends { addsSelected: Set<string>; removesSelected: Set<string> }>(
  p: P,
  key: "addsSelected" | "removesSelected",
  handle: string,
): P {
  const next = new Set(p[key]);
  if (next.has(handle)) next.delete(handle);
  else next.add(handle);
  return { ...p, [key]: next };
}

function ReviewSection({
  phase,
  onAddToggle,
  onRemoveToggle,
  onConfirm,
}: {
  phase: Extract<Phase, { kind: "review" }>;
  onAddToggle: (handle: string) => void;
  onRemoveToggle: (handle: string) => void;
  onConfirm: () => void;
}) {
  const nothingChanged =
    phase.adds.length === 0 && phase.removes.length === 0;
  const totalSelected =
    phase.addsSelected.size + phase.removesSelected.size;

  return (
    <VStack space="md">
      {nothingChanged ? (
        <VStack space="sm" alignItems="center" py="$8">
          <Ionicons
            name="checkmark-circle"
            size={48}
            color={palette.success}
          />
          <Text color={palette.text} fontWeight="$semibold">
            Already up to date
          </Text>
          <Text size="xs" color={palette.textSubtle} textAlign="center">
            No changes detected since the last sync.
          </Text>
          <Button
            variant="outline"
            action="secondary"
            onPress={() => router.back()}
            mt="$2"
          >
            <ButtonText>Back</ButtonText>
          </Button>
        </VStack>
      ) : null}

      {phase.adds.length > 0 ? (
        <VStack space="sm">
          <Text
            color={palette.textSubtle}
            size="xs"
            fontWeight="$semibold"
            style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            New on DAC ({phase.adds.length})
          </Text>
          {phase.adds.map((item) => (
            <ItemRow
              key={`add-${item.handle}`}
              title={item.title}
              subtitle={item.handle}
              image={item.image ?? null}
              selected={phase.addsSelected.has(item.handle)}
              onToggle={() => onAddToggle(item.handle)}
              activeColor={palette.teal}
            />
          ))}
        </VStack>
      ) : null}

      {phase.removes.length > 0 ? (
        <VStack space="sm">
          <Text
            color={palette.textSubtle}
            size="xs"
            fontWeight="$semibold"
            style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            No longer on DAC ({phase.removes.length})
          </Text>
          <Text size="xs" color={palette.textSubtle}>
            These were on your DAC wishlist before but are gone now. Promoted
            items (ordered, stash, etc.) aren&apos;t shown — only items still
            in your wishlist tab.
          </Text>
          {phase.removes.map(({ painting, handle }) => (
            <ItemRow
              key={`rem-${painting.id}`}
              title={painting.title}
              subtitle={painting.brand ?? handle}
              image={painting.coverImage ?? null}
              selected={phase.removesSelected.has(handle)}
              onToggle={() => onRemoveToggle(handle)}
              activeColor={palette.danger}
            />
          ))}
        </VStack>
      ) : null}

      {!nothingChanged ? (
        <Button
          bg={palette.purple}
          onPress={onConfirm}
          isDisabled={totalSelected === 0}
          mt="$2"
        >
          <ButtonText>
            {totalSelected === 0
              ? "Select items above"
              : `Apply ${totalSelected} change${totalSelected === 1 ? "" : "s"}`}
          </ButtonText>
        </Button>
      ) : null}
    </VStack>
  );
}

function ItemRow({
  title,
  subtitle,
  image,
  selected,
  onToggle,
  activeColor,
}: {
  title: string;
  subtitle: string | undefined;
  image: string | null;
  selected: boolean;
  onToggle: () => void;
  activeColor: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      bg={palette.surface}
      borderRadius="$md"
      borderWidth={1}
      borderColor={selected ? activeColor : palette.border}
      overflow="hidden"
    >
      <HStack space="sm" alignItems="center">
        <Box width={56} height={56} bg={palette.surfaceAlt}>
          {image ? (
            <Image
              source={{ uri: image }}
              style={{ width: 56, height: 56 }}
              contentFit="cover"
            />
          ) : null}
        </Box>
        <Box flex={1} pr="$3">
          <Text color={palette.text} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text size="xs" color={palette.textSubtle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </Box>
        <Box pr="$3">
          <Ionicons
            name={selected ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={selected ? activeColor : palette.textSubtle}
          />
        </Box>
      </HStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 16, paddingBottom: 32 },
});
