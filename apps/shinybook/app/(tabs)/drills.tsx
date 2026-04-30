import { Box, Heading, Text, VStack } from "@gluestack-ui/themed";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet } from "react-native";

import { DrillCard } from "@/src/components/DrillCard";
import { EmptyState } from "@/src/components/EmptyState";
import { Fab } from "@/src/components/Fab";
import { FilterChips, type ChipOption } from "@/src/components/FilterChips";
import { listDrills } from "@/src/repo/drills";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import { brandGradient, palette } from "@/src/theme/colors";
import type { Drill } from "@/src/types/drill";

type DrillFilter = "all" | "round" | "square" | "specialty";

export default function DrillsScreen() {
  const [filter, setFilter] = useState<DrillFilter>("all");

  const { data, loading, refreshing, refresh } = useAsyncFocus(() => listDrills(), []);
  const drills = data ?? [];

  const counts = useMemo(() => {
    const c = { all: drills.length, round: 0, square: 0, specialty: 0 };
    for (const d of drills) c[d.shape] += 1;
    return c;
  }, [drills]);

  const filtered = useMemo(
    () => (filter === "all" ? drills : drills.filter((d) => d.shape === filter)),
    [drills, filter]
  );

  // Group by brand → sections for SectionList.
  const sections = useMemo(() => {
    const byBrand = new Map<string, Drill[]>();
    for (const d of filtered) {
      const arr = byBrand.get(d.brand) ?? [];
      arr.push(d);
      byBrand.set(d.brand, arr);
    }
    return Array.from(byBrand.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brand, data]) => ({ title: brand, data }));
  }, [filtered]);

  const options: ChipOption<DrillFilter>[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "round", label: "Round", count: counts.round },
    { id: "square", label: "Square", count: counts.square },
    { id: "specialty", label: "Specialty", count: counts.specialty },
  ];

  return (
    <Box flex={1} bg="$background0">
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Heading size="2xl" color={palette.text}>
          Drills
        </Heading>
        <Text color={palette.text} opacity={0.85}>
          Inventory of leftover drills, by brand and number
        </Text>
      </LinearGradient>

      <Box pt="$3" pb="$2">
        <FilterChips options={options} value={filter} onChange={setFilter} />
      </Box>

      {drills.length === 0 && !loading ? (
        <EmptyState
          icon="color-palette-outline"
          title="No drills tracked yet"
          message="Add drills manually or log leftovers when you finish a painting."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => <DrillCard drill={item} />}
          ItemSeparatorComponent={() => <Box height="$2" />}
          renderSectionHeader={({ section }) => (
            <Box bg="$background0" py="$2" mt="$3">
              <Text
                color={palette.textSubtle}
                size="xs"
                fontWeight="$semibold"
                style={{ letterSpacing: 1 }}
              >
                {section.title.toUpperCase()}
              </Text>
            </Box>
          )}
          stickySectionHeadersEnabled={false}
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
                No drills match this filter.
              </Text>
            </VStack>
          }
        />
      )}

      <Fab onPress={() => router.push("/drill/new")} />
    </Box>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, paddingTop: 24, paddingBottom: 28 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 96 },
});
