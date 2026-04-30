// Browse + search the Diamond Art Club "Archived Kits" collection. The site
// itself doesn't expose search on this collection, so this screen pulls the
// full list via the Shopify products.json endpoint and lets the user search
// it locally. Tapping a kit hands its product URL to the existing import
// flow (which auto-previews on mount via the ?url= param).

import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  HStack,
  Heading,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet } from "react-native";

import { DrillShapeIcon } from "@/src/components/DrillShapeIcon";
import { EmptyState } from "@/src/components/EmptyState";
import { FilterChips, type ChipOption } from "@/src/components/FilterChips";
import { PhotoImage } from "@/src/components/PhotoImage";
import { SearchBar } from "@/src/components/SearchBar";
import { SortMenu, type SortOption } from "@/src/components/SortMenu";
import {
  cachedArchivedKits,
  fetchArchivedKits,
  matchesArchivedQuery,
  type ArchivedKit,
} from "@/src/scrapers/dacArchive";
import { brandGradient, palette } from "@/src/theme/colors";

type ShapeFilter = "all" | "round" | "square";
type ArchiveSort = "title_asc" | "title_desc" | "price_asc" | "price_desc" | "artist_asc";

const SHAPE_CHIPS: ChipOption<ShapeFilter>[] = [
  { id: "all", label: "All" },
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
];

const SORT_OPTIONS: SortOption<ArchiveSort>[] = [
  { id: "title_asc", label: "Title A → Z" },
  { id: "title_desc", label: "Title Z → A" },
  { id: "price_asc", label: "Price: Low → High" },
  { id: "price_desc", label: "Price: High → Low" },
  { id: "artist_asc", label: "Artist A → Z" },
];

export default function DacArchivedScreen() {
  // Seed with the cached list so re-entries paint instantly while we re-check
  // for changes in the background.
  const [items, setItems] = useState<ArchivedKit[] | null>(cachedArchivedKits);
  const [loading, setLoading] = useState(items === null);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<number>(items?.length ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [shape, setShape] = useState<ShapeFilter>("all");
  const [sort, setSort] = useState<ArchiveSort>("title_asc");
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    if (items === null) void load(false);
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(force: boolean) {
    setError(null);
    setProgress(0);
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await fetchArchivedKits({
        force,
        onProgress: (p) => {
          if (!cancelled.current) setProgress(p.itemsSoFar);
        },
      });
      if (!cancelled.current) setItems(result);
    } catch (err: any) {
      if (!cancelled.current) setError(err?.message ?? String(err));
    } finally {
      if (!cancelled.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  const visible = useMemo(() => {
    if (!items) return [];
    let list = items;
    if (shape !== "all") {
      list = list.filter((k) => k.drillShape === shape);
    }
    if (query.trim()) {
      list = list.filter((k) => matchesArchivedQuery(k, query));
    }
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "title_asc":
          return (a.title ?? "").localeCompare(b.title ?? "");
        case "title_desc":
          return (b.title ?? "").localeCompare(a.title ?? "");
        case "price_asc":
          return (a.price ?? 0) - (b.price ?? 0);
        case "price_desc":
          return (b.price ?? 0) - (a.price ?? 0);
        case "artist_asc":
          return (a.artist ?? "").localeCompare(b.artist ?? "");
      }
    });
    return list;
  }, [items, query, shape, sort]);

  return (
    <Box flex={1} bg="$background0">
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <HStack justifyContent="space-between" alignItems="flex-start">
          <VStack flex={1}>
            <Heading size="xl" color={palette.text}>
              DAC Archive
            </Heading>
            <Text color={palette.text} opacity={0.85}>
              {items
                ? `${items.length} archived kits — tap to import`
                : `Loading archived kits${progress ? ` (${progress})` : ""}…`}
            </Text>
          </VStack>
          <Pressable
            onPress={() => setSearching((s) => !s)}
            p="$2"
            hitSlop={8}
          >
            <Ionicons
              name={searching ? "close" : "search"}
              size={22}
              color={palette.text}
            />
          </Pressable>
        </HStack>
      </LinearGradient>

      {searching ? (
        <SearchBar
          value={query}
          onChange={setQuery}
          onClose={() => {
            setQuery("");
            setSearching(false);
          }}
          placeholder="Search archived kits by title or artist…"
        />
      ) : null}

      <HStack pt="$3" pb="$2" px="$4" alignItems="center" justifyContent="space-between">
        <FilterChips options={SHAPE_CHIPS} value={shape} onChange={setShape} />
        <SortMenu options={SORT_OPTIONS} value={sort} onChange={setSort} />
      </HStack>

      {error ? (
        <Box
          mx="$4"
          mt="$3"
          bg={`${palette.danger}15`}
          borderRadius="$md"
          borderWidth={1}
          borderColor={palette.danger}
          p="$3"
        >
          <Text color={palette.danger}>{error}</Text>
        </Box>
      ) : null}

      {loading && !items ? (
        <EmptyState
          icon="cloud-download-outline"
          title="Fetching the archive"
          message={
            progress
              ? `Pulled ${progress} kits so far. The full list takes a few seconds.`
              : "Hang tight — the full collection is loading."
          }
        />
      ) : items && items.length === 0 ? (
        <EmptyState
          icon="archive-outline"
          title="Nothing in the archive"
          message="The collection came back empty. Try refreshing."
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(k) => String(k.id)}
          renderItem={({ item }) => <ArchiveCard kit={item} />}
          ItemSeparatorComponent={() => <Box height="$2" />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={palette.teal}
            />
          }
          ListEmptyComponent={
            query.trim() ? (
              <VStack px="$4" py="$6">
                <Text color={palette.textMuted} textAlign="center">
                  No archived kits match "{query.trim()}".
                </Text>
              </VStack>
            ) : null
          }
        />
      )}
    </Box>
  );
}

function ArchiveCard({ kit }: { kit: ArchivedKit }) {
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/painting/import",
          params: { url: kit.productUrl },
        })
      }
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={palette.border}
      overflow="hidden"
    >
      <HStack space="md">
        <Box width={88} height={88} bg={palette.surfaceAlt}>
          {kit.coverImage ? (
            <PhotoImage
              photoRef={kit.coverImage}
              style={{ width: 88, height: 88 }}
              contentFit="cover"
              transition={150}
            />
          ) : null}
        </Box>
        <VStack flex={1} py="$2.5" pr="$3" space="xs" justifyContent="center">
          <Text color={palette.text} fontWeight="$semibold" numberOfLines={2}>
            {kit.title}
          </Text>
          {kit.artist ? (
            <Text size="sm" color={palette.textMuted} numberOfLines={1}>
              {kit.artist}
            </Text>
          ) : null}
          <HStack space="xs" alignItems="center">
            {kit.price ? (
              <Text size="xs" color={palette.textSubtle}>
                ${kit.price.toFixed(2)}
              </Text>
            ) : null}
            <DrillShapeIcon shape={kit.drillShape} />
          </HStack>
        </VStack>
        <Box justifyContent="center" pr="$3">
          <Ionicons
            name="chevron-forward"
            size={18}
            color={palette.textSubtle}
          />
        </Box>
      </HStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, paddingTop: 24, paddingBottom: 24 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
});
