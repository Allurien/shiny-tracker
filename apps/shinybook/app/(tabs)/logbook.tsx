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
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet } from "react-native";

import { EmptyState } from "@/src/components/EmptyState";
import { FilterChips, type ChipOption } from "@/src/components/FilterChips";
import { PaintingCard } from "@/src/components/PaintingCard";
import { SearchBar, matchesQuery } from "@/src/components/SearchBar";
import { SortMenu, type SortOption } from "@/src/components/SortMenu";
import { listPaintings } from "@/src/repo/paintings";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import { brandGradient, palette } from "@/src/theme/colors";
import type { Painting } from "@/src/types/painting";

type LogbookFilter = "all" | "thisYear" | "topRated";
type LogbookSort =
  | "completed_desc"
  | "title_asc"
  | "hours_desc"
  | "rating_desc";

const SORT_OPTIONS: SortOption<LogbookSort>[] = [
  { id: "completed_desc", label: "Recently completed" },
  { id: "title_asc", label: "Title A→Z" },
  { id: "hours_desc", label: "Hours worked" },
  { id: "rating_desc", label: "Rating" },
];

const ANY_SOURCE = "__any_source__";
type LogbookSourceFilter = typeof ANY_SOURCE | "purchase" | "destash";

const SOURCE_OPTIONS: SortOption<LogbookSourceFilter>[] = [
  { id: ANY_SOURCE, label: "Any source" },
  { id: "purchase", label: "Purchase" },
  { id: "destash", label: "Destash" },
];

export default function LogbookScreen() {
  const [filter, setFilter] = useState<LogbookFilter>("all");
  const [source, setSource] = useState<LogbookSourceFilter>(ANY_SOURCE);
  const [sort, setSort] = useState<LogbookSort>("completed_desc");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const { data, loading, refreshing, refresh } = useAsyncFocus(
    () =>
      listPaintings({
        status: "completed",
        orderBy: "completedAt",
        direction: "DESC",
      }),
    []
  );

  const paintings = data ?? [];

  const counts = useMemo(() => {
    const year = new Date().getFullYear();
    const thisYear = paintings.filter(
      (p) => p.completedAt && new Date(p.completedAt).getFullYear() === year
    ).length;
    const topRated = paintings.filter((p) => (p.rating ?? 0) >= 4).length;
    return { all: paintings.length, thisYear, topRated };
  }, [paintings]);

  const visible = useMemo(() => {
    let list = paintings;
    if (filter === "thisYear") {
      const year = new Date().getFullYear();
      list = list.filter(
        (p) => p.completedAt && new Date(p.completedAt).getFullYear() === year
      );
    } else if (filter === "topRated") {
      list = list.filter((p) => (p.rating ?? 0) >= 4);
    }
    if (source !== ANY_SOURCE) {
      // Unspecified source is treated as "purchase" (pre-migration rows).
      list = list.filter((p) => (p.source ?? "purchase") === source);
    }
    if (query.trim()) {
      list = list.filter((p) => matchesQuery(p, query));
    }
    return sortLogbook(list, sort);
  }, [paintings, filter, source, sort, query]);

  const options: ChipOption<LogbookFilter>[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "thisYear", label: "This year", count: counts.thisYear },
    { id: "topRated", label: "4★ +", count: counts.topRated },
  ];

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
            <Heading size="2xl" color={palette.text}>
              Logbook
            </Heading>
            <Text color={palette.text} opacity={0.85}>
              Completed paintings, sorted newest first
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
        <FilterChips options={options} value={filter} onChange={setFilter} />
      </Box>
      <HStack justifyContent="space-between" alignItems="center" px="$4" pb="$2">
        <SortMenu
          options={SOURCE_OPTIONS}
          value={source}
          onChange={setSource}
          header="FILTER BY SOURCE"
          icon="pricetag-outline"
        />
        <SortMenu options={SORT_OPTIONS} value={sort} onChange={setSort} />
      </HStack>

      {paintings.length === 0 && !loading ? (
        <EmptyState
          icon="book-outline"
          title="Nothing finished yet"
          message="Mark a painting complete from its detail screen to start your logbook."
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PaintingCard painting={item} secondaryLine={secondaryLineFor(item)} />
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
                No completed paintings match this filter.
              </Text>
            </VStack>
          }
        />
      )}
    </Box>
  );
}

function secondaryLineFor(p: Painting): string | undefined {
  const parts: string[] = [];
  if (p.completedAt) parts.push(formatDate(p.completedAt));
  if (p.rating) parts.push("★".repeat(p.rating));
  if ((p.hoursWorked ?? 0) > 0) parts.push(`${p.hoursWorked!.toFixed(1)}h`);
  return parts.length ? parts.join("  ·  ") : undefined;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sortLogbook(list: Painting[], sort: LogbookSort): Painting[] {
  const copy = [...list];
  switch (sort) {
    case "title_asc":
      copy.sort((a, b) =>
        a.title.toLocaleLowerCase().localeCompare(b.title.toLocaleLowerCase())
      );
      break;
    case "hours_desc":
      copy.sort((a, b) => (b.hoursWorked ?? 0) - (a.hoursWorked ?? 0));
      break;
    case "rating_desc":
      copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    default:
      // completed_desc — newest completion first, nulls at the end.
      copy.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }
  return copy;
}

const styles = StyleSheet.create({
  hero: { padding: 20, paddingTop: 24, paddingBottom: 28 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
});
