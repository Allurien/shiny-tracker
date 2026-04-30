import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  Button,
  ButtonText,
  HStack,
  Heading,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";

import { listDrills } from "@/src/repo/drills";
import { countByStatus, listPaintings } from "@/src/repo/paintings";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import { brandGradient, palette } from "@/src/theme/colors";
import type { PaintingStatus } from "@/src/types/painting";

const STATUS_LABELS: Record<PaintingStatus, string> = {
  wishlist: "Wishlist",
  ordered: "Ordered",
  stash: "On hand",
  in_progress: "In progress",
  completed: "Completed",
};

const STATUS_COLORS: Record<PaintingStatus, string> = {
  wishlist: palette.status.wishlist,
  ordered: palette.status.ordered,
  stash: palette.status.stash,
  in_progress: palette.status.inProgress,
  completed: palette.status.completed,
};

export default function StatsScreen() {
  const { data, refreshing, refresh } = useAsyncFocus(async () => {
    const [counts, paintings, drills] = await Promise.all([
      countByStatus(),
      listPaintings(),
      listDrills(),
    ]);
    return { counts, paintings, drills };
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const { paintings, drills } = data;

    const totalHours = paintings.reduce((s, p) => s + (p.hoursWorked ?? 0), 0);
    const completed = paintings.filter((p) => p.status === "completed");
    const avgHours =
      completed.length > 0
        ? completed.reduce((s, p) => s + (p.hoursWorked ?? 0), 0) /
          completed.length
        : 0;

    const year = new Date().getFullYear();
    const completedThisYear = completed.filter(
      (p) => p.completedAt && new Date(p.completedAt).getFullYear() === year
    ).length;

    const brandCounts = new Map<string, number>();
    for (const p of paintings) {
      if (!p.brand) continue;
      brandCounts.set(p.brand, (brandCounts.get(p.brand) ?? 0) + 1);
    }
    const topBrand = Array.from(brandCounts.entries()).sort(
      ([, a], [, b]) => b - a
    )[0];

    const drillsPlaced = completed.reduce(
      (s, p) => s + (p.drillCount ?? 0),
      0
    );

    return {
      totalHours,
      avgHours,
      completedThisYear,
      topBrand,
      drillTypes: drills.length,
      drillsPlaced,
    };
  }, [data]);

  return (
    <Box flex={1} bg="$background0">
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Heading size="2xl" color={palette.text}>
          Stats
        </Heading>
        <Text color={palette.text} opacity={0.85}>
          Hours painted, drills used, paintings finished
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.teal}
          />
        }
      >
        <Section title="Paintings">
          <HStack space="sm" flexWrap="wrap">
            {(Object.keys(STATUS_LABELS) as PaintingStatus[]).map((s) => (
              <StatTile
                key={s}
                label={STATUS_LABELS[s]}
                value={String(data?.counts[s] ?? 0)}
                accent={STATUS_COLORS[s]}
              />
            ))}
          </HStack>
        </Section>

        <Section title="Time">
          <HStack space="sm" flexWrap="wrap">
            <StatTile
              label="Total hours"
              value={stats ? stats.totalHours.toFixed(1) : "0.0"}
              accent={palette.teal}
            />
            <StatTile
              label="Avg per finish"
              value={stats ? `${stats.avgHours.toFixed(1)}h` : "—"}
              accent={palette.blue}
            />
            <StatTile
              label="Done this year"
              value={String(stats?.completedThisYear ?? 0)}
              accent={palette.status.completed}
            />
          </HStack>
        </Section>

        <Section title="Drills">
          <HStack space="sm" flexWrap="wrap">
            <StatTile
              label="Drills placed"
              value={
                stats ? stats.drillsPlaced.toLocaleString() : "0"
              }
              accent={palette.status.completed}
            />
            <StatTile
              label="Drill types"
              value={String(stats?.drillTypes ?? 0)}
              accent={palette.purple}
            />
          </HStack>
        </Section>

        {stats?.topBrand ? (
          <Section title="Top brand">
            <Box
              bg={palette.surface}
              borderRadius="$lg"
              borderWidth={1}
              borderColor={palette.border}
              p="$4"
            >
              <Text color={palette.text} fontWeight="$semibold" size="lg">
                {stats.topBrand[0]}
              </Text>
              <Text color={palette.textMuted} size="sm">
                {stats.topBrand[1]} painting
                {stats.topBrand[1] === 1 ? "" : "s"}
              </Text>
            </Box>
          </Section>
        ) : null}

        <Button
          variant="outline"
          action="secondary"
          onPress={() => router.push("/export")}
          mt="$2"
        >
          <HStack space="xs" alignItems="center">
            <Ionicons name="cloud-download-outline" size={16} color={palette.text} />
            <ButtonText>Export backup</ButtonText>
          </HStack>
        </Button>
      </ScrollView>
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <VStack space="sm" mb="$4">
      <Text
        color={palette.textSubtle}
        size="xs"
        fontWeight="$semibold"
        style={{ letterSpacing: 1 }}
      >
        {title.toUpperCase()}
      </Text>
      {children}
    </VStack>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Box
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={palette.border}
      px="$3"
      py="$3"
      minWidth={108}
      flexGrow={1}
      flexBasis="30%"
    >
      <Text size="xs" color={palette.textSubtle}>
        {label}
      </Text>
      <Text color={accent} fontWeight="$bold" size="2xl">
        {value}
      </Text>
    </Box>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, paddingTop: 24, paddingBottom: 28 },
  content: { padding: 16, paddingBottom: 32 },
});
