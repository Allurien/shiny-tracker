import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  Button,
  ButtonText,
  HStack,
  Heading,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Modal, Platform, ScrollView, StyleSheet } from "react-native";

import { EmptyState } from "@/src/components/EmptyState";
import { PhotoGrid } from "@/src/components/PhotoGrid";
import { PhotoImage } from "@/src/components/PhotoImage";
import { QuantityBadge } from "@/src/components/QuantityBadge";
import { SessionTimer } from "@/src/components/SessionTimer";
import { StatusBadge } from "@/src/components/StatusBadge";
import { nowIso } from "@/src/db/client";
import { deletePainting, getPainting, updatePainting } from "@/src/repo/paintings";
import { listSessions } from "@/src/repo/sessions";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import * as haptics from "@/src/lib/haptics";
import { palette } from "@/src/theme/colors";
import type { Painting, PaintingPatch, PaintingStatus } from "@/src/types/painting";
import type { Session } from "@/src/types/session";

const NEXT_STEP: Partial<
  Record<PaintingStatus, { label: string; status: PaintingStatus; dateField?: keyof Painting }>
> = {
  wishlist: { label: "Mark as ordered", status: "ordered", dateField: "purchasedAt" },
  ordered: { label: "Mark as received", status: "stash", dateField: "receivedAt" },
  stash: { label: "Start painting", status: "in_progress", dateField: "startedAt" },
  in_progress: { label: "Mark complete", status: "completed", dateField: "completedAt" },
};

export default function PaintingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refresh } = useAsyncFocus(
    async () => {
      const p = await getPainting(id!);
      const sessions = p ? await listSessions(p.id) : [];
      return { painting: p, sessions };
    },
    [id]
  );
  const painting = data?.painting ?? null;
  const sessions = data?.sessions ?? [];
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (loading && !painting) {
    return (
      <Box flex={1} bg="$background0" alignItems="center" justifyContent="center">
        <Text color={palette.textMuted}>Loading…</Text>
      </Box>
    );
  }

  if (!painting) {
    return (
      <Box flex={1} bg="$background0">
        <EmptyState
          icon="alert-circle-outline"
          title="Painting not found"
          message="It may have been deleted. Pull back to the stash."
          action={
            <Button onPress={() => router.back()} variant="outline">
              <ButtonText>Go back</ButtonText>
            </Button>
          }
        />
      </Box>
    );
  }

  const next = NEXT_STEP[painting.status];

  const advance = async () => {
    if (!next) return;
    // Completion has its own modal — capture rating + leftover drills there.
    if (painting.status === "in_progress") {
      haptics.light();
      router.push(`/painting/${painting.id}/complete`);
      return;
    }
    haptics.success();
    const patch: Partial<Painting> = { status: next.status };
    if (next.dateField) (patch as any)[next.dateField] = nowIso();
    await updatePainting(painting.id, patch);
    refresh();
  };

  const onDelete = () => {
    haptics.warning();
    confirm("Delete this painting?", "This cannot be undone.", async () => {
      await deletePainting(painting.id);
      router.replace("/(tabs)");
    });
  };

  const heroRef =
    painting.coverImage ??
    (painting.progressPhotos && painting.progressPhotos.length
      ? painting.progressPhotos[painting.progressPhotos.length - 1]
      : null);

  return (
    <Box flex={1} bg="$background0">
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => heroRef && setLightbox(heroRef)}>
          {heroRef ? (
            <PhotoImage
              photoRef={heroRef}
              style={styles.hero}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <Box style={styles.hero} bg={palette.surfaceAlt} />
          )}
        </Pressable>

        <VStack space="md" p="$4">
          <VStack space="xs">
            <Heading size="xl" color={palette.text}>
              {painting.title}
            </Heading>
            {painting.brand || painting.artist ? (
              <Text color={palette.textMuted}>
                {[painting.brand, painting.artist].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            <HStack space="sm" alignItems="center" pt="$1" flexWrap="wrap">
              <StatusBadge status={painting.status} />
              <QuantityBadge quantity={painting.quantity} />
              {painting.sourceUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(painting.sourceUrl!)}
                  hitSlop={4}
                  flexDirection="row"
                  alignItems="center"
                  bg={palette.surface}
                  borderRadius="$full"
                  borderWidth={1}
                  borderColor={palette.border}
                  px="$2"
                  py="$1"
                  style={{ gap: 4 }}
                >
                  <Ionicons name="open-outline" size={11} color={palette.textSubtle} />
                  <Text size="xs" color={palette.textSubtle} numberOfLines={1}>
                    {sourceUrlLabel(painting.sourceUrl)}
                  </Text>
                </Pressable>
              ) : null}
            </HStack>
          </VStack>

          {next ? (
            <Button bg={palette.purple} onPress={advance}>
              <ButtonText>{next.label}</ButtonText>
            </Button>
          ) : null}

          <SpecsGrid painting={painting} />

          <LifecycleRow painting={painting} />

          {painting.description ? (
            <Section title="Description">
              <Text color={palette.text}>{painting.description}</Text>
            </Section>
          ) : null}

          {painting.notes ? (
            <Section title="Notes">
              <Text color={palette.text}>{painting.notes}</Text>
            </Section>
          ) : null}

          {painting.status === "in_progress" ? (
            <Section title="Session">
              <SessionTimer paintingId={painting.id} onChange={refresh} />
            </Section>
          ) : null}

          <Section title="Progress photos">
            <PhotoGrid
              paintingId={painting.id}
              photos={painting.progressPhotos ?? []}
              onPhotoPress={(ref) => setLightbox(ref)}
              onChange={async (next) => {
                // Always send the array (even empty) so a remove reaches the
                // server — JSON.stringify drops `undefined`, which would leave
                // the server's previous list intact and resurrect on next pull.
                const patch: PaintingPatch = { progressPhotos: next };
                // Keep coverImage in sync with progressPhotos so the stash
                // card (which has no detail-page fallback) stays populated.
                // Two cases we own here:
                //   - no cover yet + a photo is uploaded -> promote first
                //   - cover was promoted from progressPhotos and that ref
                //     fell out (removed, or swapped local->S3) -> re-promote
                // We leave an externally-set cover (e.g. import URL) alone.
                const cover = painting.coverImage;
                const photos = painting.progressPhotos ?? [];
                const ownedByGrid = !!cover && photos.includes(cover);
                const stillInList = !!cover && next.includes(cover);
                if (!cover && next.length > 0) {
                  patch.coverImage = next[0];
                } else if (ownedByGrid && !stillInList) {
                  // null = clear on the server; undefined would be dropped.
                  patch.coverImage = next[0] ?? null;
                }
                await updatePainting(painting.id, patch);
                refresh();
              }}
            />
          </Section>

          <Section title="Hours worked">
            <Text color={palette.text} size="2xl" fontWeight="$bold">
              {(painting.hoursWorked ?? 0).toFixed(1)}h
            </Text>
            {painting.rating ? (
              <HStack space="xs" alignItems="center" pt="$1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Ionicons
                    key={i}
                    name={i < painting.rating! ? "star" : "star-outline"}
                    size={16}
                    color={palette.warning}
                  />
                ))}
              </HStack>
            ) : null}
          </Section>

          {sessions.length > 0 ? (
            <Section title="Sessions">
              <SessionList sessions={sessions} />
            </Section>
          ) : null}

          <HStack space="md" pt="$2">
            <Button
              flex={1}
              variant="outline"
              action="secondary"
              onPress={() => router.push(`/painting/${painting.id}/edit`)}
            >
              <ButtonText>Edit details</ButtonText>
            </Button>
            {painting.sourceUrl ? (
              <Button
                flex={1}
                variant="outline"
                action="secondary"
                onPress={() =>
                  router.push({
                    pathname: "/painting/import",
                    params: { url: painting.sourceUrl! },
                  })
                }
              >
                <ButtonText>Re-import</ButtonText>
              </Button>
            ) : null}
          </HStack>

          <Pressable
            onPress={onDelete}
            py="$3"
            alignItems="center"
            borderRadius="$md"
            $hover-bg={palette.surface}
          >
            <HStack space="xs" alignItems="center">
              <Ionicons name="trash-outline" size={16} color={palette.danger} />
              <Text color={palette.danger}>Delete painting</Text>
            </HStack>
          </Pressable>
        </VStack>
      </ScrollView>

      <Lightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </Box>
  );
}

function SessionList({ sessions }: { sessions: Session[] }) {
  const recent = sessions.slice(0, 8);
  return (
    <VStack space="xs">
      {recent.map((s) => (
        <HStack
          key={s.id}
          justifyContent="space-between"
          alignItems="center"
          bg={palette.surface}
          borderRadius="$md"
          borderWidth={1}
          borderColor={palette.border}
          px="$3"
          py="$2"
        >
          <VStack>
            <Text color={palette.text} size="sm">
              {formatDateTime(s.startedAt)}
            </Text>
            {s.endedAt ? null : (
              <Text size="xs" color={palette.teal}>
                In progress
              </Text>
            )}
          </VStack>
          <Text color={palette.text} fontWeight="$semibold" style={{ fontVariant: ["tabular-nums"] }}>
            {formatDuration(s.durationSeconds)}
          </Text>
        </HStack>
      ))}
      {sessions.length > recent.length ? (
        <Text size="xs" color={palette.textSubtle}>
          +{sessions.length - recent.length} earlier
        </Text>
      ) : null}
    </VStack>
  );
}

function Lightbox({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.lightboxBackdrop} onPress={onClose}>
        {uri ? (
          <PhotoImage
            photoRef={uri}
            style={styles.lightboxImage}
            contentFit="contain"
          />
        ) : null}
        <Pressable onPress={onClose} style={styles.lightboxClose}>
          <Ionicons name="close" size={28} color={palette.text} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SpecsGrid({ painting }: { painting: Painting }) {
  const specs: { label: string; value: string }[] = [];
  if (painting.canvasSize) specs.push({ label: "Canvas", value: painting.canvasSize });
  if (painting.drillShape && painting.drillShape !== "unknown") {
    specs.push({ label: "Drill shape", value: capitalize(painting.drillShape) });
  }
  if (painting.drillCount) {
    specs.push({ label: "Drills", value: painting.drillCount.toLocaleString() });
  }
  if (painting.colorCount) {
    specs.push({ label: "Colors", value: String(painting.colorCount) });
  }
  if (painting.price) {
    specs.push({
      label: "Price",
      value: `${painting.currency ?? ""}${painting.price.toFixed(2)}`,
    });
  }
  if (painting.source) {
    specs.push({
      label: "Source",
      value: painting.source === "destash" ? "Destash" : "Purchase",
    });
  }
  if (painting.eventName) {
    specs.push({ label: "Event", value: painting.eventName });
  }
  if (specs.length === 0) return null;
  return (
    <Section title="Specs">
      <HStack space="sm" flexWrap="wrap">
        {specs.map((s) => (
          <Box
            key={s.label}
            bg={palette.surface}
            borderRadius="$lg"
            borderWidth={1}
            borderColor={palette.border}
            px="$3"
            py="$2"
            minWidth={108}
            flexGrow={1}
            flexBasis="30%"
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
    </Section>
  );
}

function LifecycleRow({ painting }: { painting: Painting }) {
  const dates: { label: string; value?: string }[] = [
    { label: "Ordered", value: painting.purchasedAt },
    { label: "Received", value: painting.receivedAt },
    { label: "Started", value: painting.startedAt },
    { label: "Completed", value: painting.completedAt },
  ].filter((d) => d.value);
  if (dates.length === 0) return null;
  return (
    <Section title="Timeline">
      <VStack space="xs">
        {dates.map((d) => (
          <HStack key={d.label} justifyContent="space-between">
            <Text color={palette.textMuted}>{d.label}</Text>
            <Text color={palette.text}>{formatDate(d.value!)}</Text>
          </HStack>
        ))}
      </VStack>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <VStack space="xs">
      <Text size="xs" color={palette.textSubtle} fontWeight="$semibold" style={{ letterSpacing: 1 }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </VStack>
  );
}

function sourceUrlLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// Cross-platform confirm. Alert.alert on iOS/Android maps to native dialog;
// on web, RN-Web routes Alert.alert to window.confirm via a single button,
// which loses the cancel branch — so use window.confirm directly there.
function confirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  hero: { width: "100%", height: 280 },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImage: {
    width: "100%",
    height: "100%",
  },
  lightboxClose: {
    position: "absolute",
    top: 40,
    right: 20,
    padding: 12,
  },
});
