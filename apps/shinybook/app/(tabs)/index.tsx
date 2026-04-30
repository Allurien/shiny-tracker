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
import { useMemo, useState } from "react";
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet } from "react-native";

import { EmptyState } from "@/src/components/EmptyState";
import { Fab } from "@/src/components/Fab";
import { FilterChips, type ChipOption } from "@/src/components/FilterChips";
import { HeroWave } from "@/src/components/HeroWave";
import { PaintingCard } from "@/src/components/PaintingCard";
import { SearchBar, matchesQuery } from "@/src/components/SearchBar";
import { SortMenu, type SortOption } from "@/src/components/SortMenu";
import { listPaintings } from "@/src/repo/paintings";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import { brandGradient, palette } from "@/src/theme/colors";
import type { Painting } from "@/src/types/painting";

type StashFilter = "all" | "stash" | "in_progress" | "ordered";
type StashStatus = "stash" | "in_progress" | "ordered";
type StashSort =
  | "updated_desc"
  | "added_desc"
  | "title_asc"
  | "received_desc"
  | "hours_desc";

const STATUSES_FOR: Record<StashFilter, StashStatus[]> = {
  all: ["stash", "in_progress", "ordered"],
  stash: ["stash"],
  in_progress: ["in_progress"],
  ordered: ["ordered"],
};

const SORT_OPTIONS: SortOption<StashSort>[] = [
  { id: "updated_desc", label: "Recently updated" },
  { id: "added_desc", label: "Recently added" },
  { id: "title_asc", label: "Title A→Z" },
  { id: "received_desc", label: "Received date" },
  { id: "hours_desc", label: "Hours worked" },
];

const ANY_BRAND = "__any_brand__";
const ANY_ARTIST = "__any_artist__";
const ANY_SOURCE = "__any_source__";

type StashSourceFilter = typeof ANY_SOURCE | "purchase" | "destash";

const SOURCE_OPTIONS: SortOption<StashSourceFilter>[] = [
  { id: ANY_SOURCE, label: "Any source" },
  { id: "purchase", label: "Purchase" },
  { id: "destash", label: "Destash" },
];

export default function StashScreen() {
  const [filter, setFilter] = useState<StashFilter>("all");
  const [brand, setBrand] = useState<string>(ANY_BRAND);
  const [artist, setArtist] = useState<string>(ANY_ARTIST);
  const [source, setSource] = useState<StashSourceFilter>(ANY_SOURCE);
  const [sort, setSort] = useState<StashSort>("updated_desc");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data, loading, refreshing, refresh } = useAsyncFocus(
    () => listPaintings({ status: ["stash", "in_progress", "ordered"] }),
    []
  );

  const paintings = data ?? [];

  const brandOptions: ChipOption<string>[] = useMemo(() => {
    // Bucket case-insensitively so legacy duplicates like "Diamond Art Club"
    // and "DIAMOND ART CLUB" collapse into one chip. Pick the most-used
    // casing per group as the canonical label so the UI looks intentional.
    const groups = new Map<string, Map<string, number>>();
    for (const p of paintings) {
      const raw = p.brand?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const counts = groups.get(key) ?? new Map<string, number>();
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
      groups.set(key, counts);
    }
    const canonical: string[] = [];
    for (const counts of groups.values()) {
      let best = "";
      let bestN = -1;
      for (const [name, n] of counts) {
        if (n > bestN) {
          best = name;
          bestN = n;
        }
      }
      canonical.push(best);
    }
    canonical.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    return [
      { id: ANY_BRAND, label: "All brands" },
      ...canonical.map((b) => ({ id: b, label: b })),
    ];
  }, [paintings]);

  const artistOptions: SortOption<string>[] = useMemo(() => {
    const set = new Set<string>();
    for (const p of paintings) if (p.artist) set.add(p.artist);
    const sorted = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    return [
      { id: ANY_ARTIST, label: "Any artist" },
      ...sorted.map((a) => ({ id: a, label: a })),
    ];
  }, [paintings]);

  // Keep the artist/brand selection valid when the underlying set changes.
  // E.g. the last painting by a given artist gets deleted — fall back to "any".
  const activeBrand = brandOptions.some((o) => o.id === brand) ? brand : ANY_BRAND;
  const activeArtist = artistOptions.some((o) => o.id === artist)
    ? artist
    : ANY_ARTIST;

  const visible = useMemo(() => {
    let list = paintings.filter((p) =>
      STATUSES_FOR[filter].includes(p.status as StashStatus)
    );
    if (activeBrand !== ANY_BRAND) {
      // Compare case-insensitively so the chip catches every casing variant
      // (legacy data may still contain mixed casings until the user re-imports).
      const target = activeBrand.toLowerCase();
      list = list.filter((p) => (p.brand ?? "").toLowerCase() === target);
    }
    if (activeArtist !== ANY_ARTIST) {
      list = list.filter((p) => p.artist === activeArtist);
    }
    if (source !== ANY_SOURCE) {
      // Unspecified source is treated as "purchase" (pre-migration rows).
      list = list.filter((p) => (p.source ?? "purchase") === source);
    }
    if (query.trim()) {
      list = list.filter((p) => matchesQuery(p, query));
    }
    return sortStash(list, sort);
  }, [paintings, filter, activeBrand, activeArtist, source, sort, query]);

  const counts = useMemo(() => {
    const stash = paintings.filter((p) => p.status === "stash").length;
    const inProgress = paintings.filter((p) => p.status === "in_progress").length;
    const ordered = paintings.filter((p) => p.status === "ordered").length;
    return { all: paintings.length, stash, in_progress: inProgress, ordered };
  }, [paintings]);

  const statusOptions: ChipOption<StashFilter>[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "in_progress", label: "In progress", count: counts.in_progress },
    { id: "stash", label: "Stash", count: counts.stash },
    { id: "ordered", label: "Ordered", count: counts.ordered },
  ];

  // Number of non-default filter axes active. Drives the badge on the
  // Filter trigger so the user can see at a glance whether anything is
  // currently narrowing the list.
  const activeFilterCount =
    (activeBrand !== ANY_BRAND ? 1 : 0)
    + (activeArtist !== ANY_ARTIST ? 1 : 0)
    + (source !== ANY_SOURCE ? 1 : 0);

  return (
    <Box flex={1} bg="$background0">
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <HeroWave />
        <HStack justifyContent="space-between" alignItems="flex-start">
          <VStack flex={1}>
            <Heading size="2xl" color={palette.text}>
              Stash
            </Heading>
            <Text color={palette.text} opacity={0.85}>
              In stash, on the way, and in progress
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
        />
      ) : null}

      <Box pt="$3" pb="$2">
        <FilterChips options={statusOptions} value={filter} onChange={setFilter} />
      </Box>

      <HStack
        justifyContent="space-between"
        alignItems="center"
        px="$4"
        pb="$2"
        space="sm"
      >
        <FilterTrigger
          count={activeFilterCount}
          onPress={() => setFiltersOpen(true)}
        />
        <SortMenu options={SORT_OPTIONS} value={sort} onChange={setSort} />
      </HStack>

      <StashFiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        brandOptions={brandOptions}
        artistOptions={artistOptions}
        brand={activeBrand}
        artist={activeArtist}
        source={source}
        onBrandChange={setBrand}
        onArtistChange={setArtist}
        onSourceChange={setSource}
        onReset={() => {
          setBrand(ANY_BRAND);
          setArtist(ANY_ARTIST);
          setSource(ANY_SOURCE);
        }}
      />

      {paintings.length === 0 && !loading ? (
        <EmptyState
          icon="albums-outline"
          title="No paintings yet"
          message="Tap the + button to import a painting from a URL or add one manually."
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PaintingCard
              painting={item}
              secondaryLine={secondaryLineFor(item)}
            />
          )}
          ItemSeparatorComponent={() => <Box height="$2" />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={palette.teal}
            />
          }
          ListEmptyComponent={
            <VStack px="$4" py="$6">
              <Text color={palette.textMuted} textAlign="center">
                No paintings match these filters.
              </Text>
            </VStack>
          }
        />
      )}

      <Fab onPress={() => router.push("/painting/import")} />
    </Box>
  );
}

function secondaryLineFor(p: Painting): string | undefined {
  if (p.status === "in_progress" && (p.hoursWorked ?? 0) > 0) {
    return `${p.hoursWorked!.toFixed(1)}h logged`;
  }
  if (p.status === "stash" && p.receivedAt) {
    return `Received ${formatDate(p.receivedAt)}`;
  }
  if (p.status === "ordered" && p.purchasedAt) {
    return `Ordered ${formatDate(p.purchasedAt)}`;
  }
  return undefined;
}

function sortStash(list: Painting[], sort: StashSort): Painting[] {
  const copy = [...list];
  switch (sort) {
    case "added_desc":
      copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "title_asc":
      copy.sort((a, b) =>
        a.title.toLocaleLowerCase().localeCompare(b.title.toLocaleLowerCase())
      );
      break;
    case "received_desc":
      copy.sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
      break;
    case "hours_desc":
      copy.sort((a, b) => (b.hoursWorked ?? 0) - (a.hoursWorked ?? 0));
      break;
    default:
      // updated_desc
      copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return copy;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Pill-shaped trigger that opens the multi-axis filter sheet. Shows a small
// badge with the count of non-default filters so the user can see at a
// glance whether anything is currently narrowing the list.
function FilterTrigger({ count, onPress }: { count: number; onPress: () => void }) {
  const active = count > 0;
  return (
    <Pressable
      onPress={onPress}
      px="$3"
      py="$1.5"
      borderRadius="$full"
      borderWidth={1}
      borderColor={active ? palette.teal : palette.border}
      bg={active ? `${palette.teal}22` : palette.surface}
    >
      <HStack space="xs" alignItems="center">
        <Ionicons
          name="options-outline"
          size={14}
          color={active ? palette.teal : palette.textMuted}
        />
        <Text
          size="sm"
          color={active ? palette.teal : palette.textMuted}
          fontWeight={active ? "$semibold" : "$normal"}
        >
          {active ? `Filters (${count})` : "Filters"}
        </Text>
      </HStack>
    </Pressable>
  );
}

interface StashFiltersSheetProps {
  open: boolean;
  onClose: () => void;
  brandOptions: ChipOption<string>[];
  artistOptions: SortOption<string>[];
  brand: string;
  artist: string;
  source: StashSourceFilter;
  onBrandChange: (v: string) => void;
  onArtistChange: (v: string) => void;
  onSourceChange: (v: StashSourceFilter) => void;
  onReset: () => void;
}

// Bottom sheet that consolidates Brand + Artist + Source into one place.
// Modeled after the SortMenu sheet (transparent backdrop, slides up from
// bottom), but multi-section so a single open lets the user adjust all
// filter axes at once. Choices apply immediately on tap; the Done button
// just closes — there's no "apply" step so the underlying list stays
// responsive while the user picks.
function StashFiltersSheet({
  open,
  onClose,
  brandOptions,
  artistOptions,
  brand,
  artist,
  source,
  onBrandChange,
  onArtistChange,
  onSourceChange,
  onReset,
}: StashFiltersSheetProps) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Box
            bg={palette.bg}
            borderTopLeftRadius="$2xl"
            borderTopRightRadius="$2xl"
            borderWidth={1}
            borderColor={palette.border}
            p="$4"
            pb="$6"
            maxHeight={640}
          >
            <HStack alignItems="center" justifyContent="space-between" mb="$3">
              <Text
                size="md"
                color={palette.text}
                fontWeight="$semibold"
              >
                Filters
              </Text>
              <Pressable onPress={onReset} hitSlop={8} px="$2" py="$1">
                <Text size="sm" color={palette.teal}>
                  Reset
                </Text>
              </Pressable>
            </HStack>

            <ScrollView
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <VStack space="lg">
                <FilterSection title="Brand">
                  {brandOptions.map((opt) => (
                    <FilterRow
                      key={opt.id}
                      label={opt.label}
                      active={opt.id === brand}
                      onPress={() => onBrandChange(opt.id)}
                    />
                  ))}
                </FilterSection>

                <FilterSection title="Artist">
                  {artistOptions.map((opt) => (
                    <FilterRow
                      key={opt.id}
                      label={opt.label}
                      active={opt.id === artist}
                      onPress={() => onArtistChange(opt.id)}
                    />
                  ))}
                </FilterSection>

                <FilterSection title="Source">
                  {SOURCE_OPTIONS.map((opt) => (
                    <FilterRow
                      key={opt.id}
                      label={opt.label}
                      active={opt.id === source}
                      onPress={() => onSourceChange(opt.id)}
                    />
                  ))}
                </FilterSection>
              </VStack>
            </ScrollView>

            <Pressable
              onPress={onClose}
              mt="$4"
              py="$3"
              borderRadius="$md"
              bg={palette.teal}
              alignItems="center"
            >
              <Text color={palette.text} fontWeight="$semibold">
                Done
              </Text>
            </Pressable>
          </Box>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <VStack space="xs">
      <Text
        size="xs"
        color={palette.textSubtle}
        fontWeight="$semibold"
        style={{ letterSpacing: 1 }}
      >
        {title.toUpperCase()}
      </Text>
      <VStack space="xs">{children}</VStack>
    </VStack>
  );
}

function FilterRow({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      px="$3"
      py="$3"
      borderRadius="$md"
      bg={active ? `${palette.teal}22` : "transparent"}
    >
      <HStack space="sm" alignItems="center">
        <Ionicons
          name={active ? "radio-button-on" : "radio-button-off"}
          size={18}
          color={active ? palette.teal : palette.textSubtle}
        />
        <Text
          color={active ? palette.teal : palette.text}
          fontWeight={active ? "$semibold" : "$normal"}
        >
          {label}
        </Text>
      </HStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, paddingTop: 24, paddingBottom: 28 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96 },
});
