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
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Linking, RefreshControl, StyleSheet } from "react-native";

import { wishlistSourcesApi } from "@/src/api";
import type { WishlistSource } from "@/src/api/wishlistSources";
import { EmptyState } from "@/src/components/EmptyState";
import { Fab } from "@/src/components/Fab";
import { HeroWave } from "@/src/components/HeroWave";
import { PaintingCard } from "@/src/components/PaintingCard";
import { SearchBar, matchesQuery } from "@/src/components/SearchBar";
import { SortMenu, type SortOption } from "@/src/components/SortMenu";
import { listPaintings } from "@/src/repo/paintings";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import { brandGradient, palette } from "@/src/theme/colors";
import type { Painting } from "@/src/types/painting";

type WishlistSort = "added_desc" | "title_asc";

const SORT_OPTIONS: SortOption<WishlistSort>[] = [
  { id: "added_desc", label: "Recently added" },
  { id: "title_asc", label: "Title A→Z" },
];

export default function WishlistScreen() {
  const [sort, setSort] = useState<WishlistSort>("added_desc");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const { data, loading, refreshing, refresh } = useAsyncFocus(
    () => listPaintings({ status: "wishlist" }),
    []
  );

  const paintings = data ?? [];
  const visible = useMemo(() => {
    const filtered = query.trim()
      ? paintings.filter((p) => matchesQuery(p, query))
      : paintings;
    return sortPaintings(filtered, sort);
  }, [paintings, sort, query]);

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
              Wishlist
            </Heading>
            <Text color={palette.text} opacity={0.85}>
              Paintings you want to add to the stash
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

      {paintings.length === 0 && !loading ? (
        <>
          <SourcesSection />
          <EmptyState
            icon="heart-outline"
            title="Wishlist is empty"
            message="Tap the + button to import a Diamond Art Club wishlist or save individual paintings here."
          />
        </>
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
          ListHeaderComponent={
            <VStack space="md">
              <SourcesSection />
              <HStack justifyContent="flex-end" pt="$1" pb="$1">
                <SortMenu
                  options={SORT_OPTIONS}
                  value={sort}
                  onChange={setSort}
                />
              </HStack>
            </VStack>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={palette.teal}
            />
          }
        />
      )}

      <Fab onPress={() => router.push("/painting/wishlist-import")} />
    </Box>
  );
}

function secondaryLineFor(p: Painting): string | undefined {
  if (p.price) {
    return `${p.currency ?? ""}${p.price.toFixed(2)}`.trim();
  }
  return undefined;
}

function sortPaintings(list: Painting[], sort: WishlistSort): Painting[] {
  const copy = [...list];
  if (sort === "title_asc") {
    copy.sort((a, b) =>
      a.title.toLocaleLowerCase().localeCompare(b.title.toLocaleLowerCase())
    );
  } else {
    // added_desc — newest createdAt first.
    copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return copy;
}

// Lists imported DAC wishlist URLs with per-source refresh + delete. The
// source row is metadata only — deleting it doesn't touch any paintings, it
// just stops offering the "refresh" affordance for that DAC list.
function SourcesSection() {
  const [sources, setSources] = useState<WishlistSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Re-fetch whenever the wishlist tab regains focus — that's when the user
  // would notice stale data (e.g. just returned from the refresh modal and
  // `lastSyncedAt` should advance). Tabs stay mounted across navigations, so
  // an unconditional setInterval would burn cycles in the background.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const items = await wishlistSourcesApi.listSources();
          if (!cancelled) {
            setSources(items);
            setFetchError(false);
          }
        } catch (err) {
          console.warn("[wishlist] failed to load sources", err);
          if (!cancelled) setFetchError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  function confirmDelete(source: WishlistSource) {
    Alert.alert(
      "Stop tracking this wishlist?",
      `${source.name}\n\nNo paintings will be deleted — this just removes the refresh button.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop tracking",
          style: "destructive",
          onPress: async () => {
            try {
              await wishlistSourcesApi.deleteSource(source.id);
              setSources((prev) => prev.filter((s) => s.id !== source.id));
            } catch (err) {
              console.warn("[wishlist] failed to delete source", err);
            }
          },
        },
      ],
    );
  }

  if (loading) return null;

  if (fetchError) {
    return (
      <Box
        mx="$4"
        mt="$3"
        bg={`${palette.danger}15`}
        borderRadius="$md"
        borderWidth={1}
        borderColor={palette.danger}
        p="$3"
      >
        <Text size="sm" color={palette.danger}>
          Couldn't load tracked wishlists. Check your connection and pull to refresh.
        </Text>
      </Box>
    );
  }

  if (sources.length === 0) return null;

  return (
    <VStack space="sm" px="$4" pt="$3">
      <Text
        color={palette.textSubtle}
        size="xs"
        fontWeight="$semibold"
        style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        Tracked DAC wishlists
      </Text>
      {sources.map((s) => (
        <SourceRow key={s.id} source={s} onDelete={() => confirmDelete(s)} />
      ))}
    </VStack>
  );
}

function SourceRow({
  source,
  onDelete,
}: {
  source: WishlistSource;
  onDelete: () => void;
}) {
  return (
    <Box
      bg={palette.surface}
      borderRadius="$md"
      borderWidth={1}
      borderColor={palette.border}
      p="$3"
    >
      <HStack space="sm" alignItems="center">
        <Pressable
          flex={1}
          onPress={() => Linking.openURL(source.url)}
          hitSlop={4}
        >
          <HStack space="xs" alignItems="center">
            <Text color={palette.text} numberOfLines={1} flex={1}>
              {source.name}
            </Text>
            <Ionicons name="open-outline" size={13} color={palette.textSubtle} />
          </HStack>
          <Text size="xs" color={palette.textSubtle}>
            Last synced {relativeTime(source.lastSyncedAt)}
          </Text>
        </Pressable>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/painting/wishlist-refresh",
              params: { id: source.id },
            } as never)
          }
          hitSlop={8}
          p="$2"
        >
          <Ionicons name="refresh" size={20} color={palette.teal} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8} p="$2">
          <Ionicons name="trash-outline" size={20} color={palette.textSubtle} />
        </Pressable>
      </HStack>
    </Box>
  );
}

// Minimal "x ago" formatter — avoids pulling in a date lib for one display.
function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  hero: { padding: 20, paddingTop: 24, paddingBottom: 28 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 96 },
});
