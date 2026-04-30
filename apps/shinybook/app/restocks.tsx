// Fallback screen for the restock push notification. Shown when the device
// browser fails to open DAC's back-in-stock page directly. Always offers a
// prominent "Open back-in-stock page" button at the top so the user can still
// reach the live page.
//
// Data: Shopify exposes /collections/<handle>/products.json publicly, no auth,
// no JS rendering. Same endpoint the bot scrapes — no need for the API to
// re-mirror the list.

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
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { palette } from "@/src/theme/colors";
import { RESTOCK_URL } from "@/src/notifications/restock";

const COLLECTION_JSON =
  "https://www.diamondartclub.com/collections/diamond-painting-restocks/products.json?limit=250";

interface RestockItem {
  id: number;
  title: string;
  handle: string;
  image: string | null;
  price: string | null;
}

interface ShopifyProductRow {
  id: number;
  title: string;
  handle: string;
  images?: { src: string }[];
  variants?: { price: string }[];
}

async function fetchRestocks(): Promise<RestockItem[]> {
  const res = await fetch(COLLECTION_JSON, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { products?: ShopifyProductRow[] };
  return (body.products ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    image: p.images?.[0]?.src ?? null,
    price: p.variants?.[0]?.price ? `$${p.variants[0].price}` : null,
  }));
}

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; items: RestockItem[] }
  | { kind: "error"; message: string };

export default function RestocksScreen() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    try {
      const items = await fetchRestocks();
      setPhase({ kind: "ready", items });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <VStack space="md">
        <Heading color={palette.text}>Back in stock</Heading>

        <Button
          bg={palette.teal}
          onPress={() => Linking.openURL(RESTOCK_URL)}
        >
          <HStack space="sm" alignItems="center">
            <Ionicons name="open-outline" size={18} color={palette.text} />
            <ButtonText color={palette.text}>
              Open back-in-stock page
            </ButtonText>
          </HStack>
        </Button>

        {phase.kind === "loading" ? (
          <Text color={palette.textMuted} textAlign="center" mt="$6">
            Loading current restocks…
          </Text>
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
              Couldn&apos;t load restocks: {phase.message}
            </Text>
            <Pressable onPress={load} mt="$2">
              <Text color={palette.teal} size="sm">
                Try again
              </Text>
            </Pressable>
          </Box>
        ) : null}

        {phase.kind === "ready" ? (
          <>
            <Text size="xs" color={palette.textSubtle}>
              {phase.items.length} item{phase.items.length === 1 ? "" : "s"}{" "}
              currently listed.
            </Text>
            {phase.items.map((item) => (
              <RestockRow key={item.id} item={item} />
            ))}
          </>
        ) : null}
      </VStack>
    </ScrollView>
  );
}

function RestockRow({ item }: { item: RestockItem }) {
  const productUrl = `https://www.diamondartclub.com/products/${item.handle}`;
  return (
    <Pressable
      onPress={() => Linking.openURL(productUrl)}
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={palette.border}
      overflow="hidden"
    >
      <HStack space="md" alignItems="center">
        <Box width={72} height={72} bg={palette.surfaceAlt}>
          {item.image ? (
            <Image
              source={{ uri: item.image }}
              style={{ width: 72, height: 72 }}
              contentFit="cover"
              transition={150}
            />
          ) : null}
        </Box>
        <VStack flex={1} py="$2.5" pr="$3" space="xs" justifyContent="center">
          <Text color={palette.text} numberOfLines={2} fontWeight="$semibold">
            {item.title}
          </Text>
          {item.price ? (
            <Text size="xs" color={palette.textSubtle}>
              {item.price}
            </Text>
          ) : null}
        </VStack>
      </HStack>
    </Pressable>
  );
}
