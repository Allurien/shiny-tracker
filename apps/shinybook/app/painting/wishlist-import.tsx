// Bulk wishlist import via a hidden WebView. The DAC wishlist page is
// rendered by Swym (JS-only), so we can't fetch the HTML directly; instead
// we mount a WebView, inject a poller that watches for product anchors to
// appear, and post the discovered handles back to RN. The user picks which
// items to keep and we hit the Shopify product JSON for each.
//
// Native-only — react-native-webview has no web implementation.

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
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { wishlistSourcesApi } from "@/src/api";
import { Field } from "@/src/components/Field";
import { createPainting, findDuplicate } from "@/src/repo/paintings";
import {
  findProductScraper,
  findWishlistScraper,
  scrapeProduct,
} from "@/src/scrapers";
import { palette } from "@/src/theme/colors";

interface ScrapedItem {
  handle: string;
  title: string;
  image?: string;
}

type Phase = "input" | "loading" | "review" | "importing" | "done";

// Polls the shared-wishlist render container for product anchors and posts
// them back to RN. We only support the ?hkey=... share URL produced by DAC's
// "Share List" button — that's the only URL form Swym renders without a
// logged-in session. The container populates client-side once Swym fetches
// the list (~3-10s on a fresh load).
const INJECTED_JS = `
(function() {
  if (window.__shinybookInjected) return;
  window.__shinybookInjected = true;
  var attempts = 0;
  var stable = 0;
  var lastSize = 0;
  var MAX_ATTEMPTS = 60;           // 30s at 500ms
  var STABLE_REQUIRED = 3;
  var CONTAINER_SELECTORS = [
    '#swym-shared-wishlist-render-container',
    '.swym-readonly-wishlist-detail',
    '.swym-wishlist-grid',
  ];
  function extractCard(a) {
    var href = a.getAttribute('href') || '';
    var m = href.match(/\\/products\\/([^?#/]+)/);
    if (!m) return null;
    var handle = m[1];
    var card = a.closest('[class*="swym-product"], [class*="swym-wishlist-item"], [class*="product-card"], li, article, div') || a;
    var titleEl = card.querySelector('[class*="title"], [class*="Title"], [class*="name"], [class*="Name"], h2, h3, h4');
    var title = titleEl ? (titleEl.textContent || '').trim() : (a.textContent || '').trim();
    var img = card.querySelector('img');
    var image = img ? (img.src || img.getAttribute('data-src') || '') : '';
    return { handle: handle, title: title || handle, image: image };
  }
  function collect() {
    for (var i = 0; i < CONTAINER_SELECTORS.length; i++) {
      var c = document.querySelector(CONTAINER_SELECTORS[i]);
      if (!c) continue;
      var nodes = c.querySelectorAll('a[href*="/products/"]');
      if (nodes.length === 0) continue;
      var out = new Map();
      for (var j = 0; j < nodes.length; j++) {
        var info = extractCard(nodes[j]);
        if (info && !out.has(info.handle)) out.set(info.handle, info);
      }
      if (out.size > 0) return { items: out, source: CONTAINER_SELECTORS[i] };
    }
    return { items: new Map(), source: null };
  }
  function snapshotDiagnostics() {
    var notes = ['url=' + (location.href || '').slice(0, 200)];
    for (var i = 0; i < CONTAINER_SELECTORS.length; i++) {
      var sel = CONTAINER_SELECTORS[i];
      var el = document.querySelector(sel);
      if (!el) { notes.push(sel + ' = not found'); continue; }
      var anchors = el.querySelectorAll('a[href*="/products/"]').length;
      var children = el.children ? el.children.length : 0;
      notes.push(sel + ' = ' + children + ' children, ' + anchors + ' product anchors');
    }
    return notes;
  }
  function scan() {
    attempts++;
    var hit = collect();
    var size = hit.items.size;
    if (size > 0 && size === lastSize) stable++; else stable = 0;
    lastSize = size;
    var ready = size > 0 && stable >= STABLE_REQUIRED;
    var timedOut = attempts >= MAX_ATTEMPTS;
    if (ready || timedOut) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'result',
        items: Array.from(hit.items.values()),
        source: hit.source,
        diagnostics: size === 0 ? snapshotDiagnostics() : null,
      }));
      return;
    }
    setTimeout(scan, 500);
  }
  setTimeout(scan, 1500);
})();
true;
`;

export default function WishlistImportScreen() {
  if (Platform.OS === "web") {
    return (
      <Box flex={1} bg="$background0" p="$4" justifyContent="center">
        <VStack space="md" alignItems="center">
          <Ionicons name="phone-portrait-outline" size={48} color={palette.textSubtle} />
          <Heading color={palette.text} textAlign="center">
            Native-only feature
          </Heading>
          <Text color={palette.textMuted} textAlign="center">
            Bulk wishlist import uses a hidden WebView, which only works in
            the iOS / Android app. Open ShinyBook on your phone to bulk
            import a Diamond Art Club wishlist.
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
  return <NativeWishlistImport />;
}

function NativeWishlistImport() {
  // Optional ?url= param — used when the single-product import bounces here
  // because the user pasted a wishlist URL on the wrong screen.
  const { url: prefilledUrl } = useLocalSearchParams<{ url?: string }>();
  const [phase, setPhase] = useState<Phase>("input");
  const [url, setUrl] = useState(prefilledUrl ?? "");

  useEffect(() => {
    if (prefilledUrl) setUrl(prefilledUrl);
  }, [prefilledUrl]);
  const [items, setItems] = useState<ScrapedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const webviewRef = useRef<WebView>(null);

  const origin = useMemo(() => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }, [url]);

  function startLoad() {
    const trimmed = url.trim();
    if (!trimmed) return;
    // Temporary workaround: if the pasted URL is a single product, bounce
    // over to the regular import screen (which handles /products/<handle>
    // for every supported brand). Wishlist scraping on DAC currently picks
    // up recommended products alongside the list, so single-product paste
    // gives a reliable path for one-off adds.
    if (findProductScraper(trimmed)) {
      router.replace({
        pathname: "/painting/import",
        params: { url: trimmed },
      } as never);
      return;
    }
    const scraper = findWishlistScraper(trimmed);
    if (!scraper) {
      setError(
        "Wishlist link must be a DAC share URL (open your wishlist in DAC, tap Share, copy the link). You can also paste a single product URL.",
      );
      return;
    }
    setError(null);
    setItems([]);
    setSelected(new Set());
    setPhase("loading");
  }

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as {
        type: string;
        items: ScrapedItem[];
        source?: string | null;
        diagnostics?: string[] | null;
      };
      if (msg.type === "result") {
        setItems(msg.items);
        setSelected(new Set(msg.items.map((i) => i.handle)));
        setPhase(msg.items.length > 0 ? "review" : "input");
        if (msg.items.length === 0) {
          const diag = msg.diagnostics?.length
            ? "\n\n" + msg.diagnostics.join("\n")
            : "";
          setError(
            "Couldn't find wishlist items. Make sure the URL came from DAC's Share button (it should contain ?hkey=) and that the list isn't empty." +
              diag,
          );
        }
      }
    } catch (err) {
      setError("Failed to parse wishlist response.");
      setPhase("input");
    }
  }

  function toggle(handle: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }

  async function importSelected() {
    if (!origin) return;
    const picks = items.filter((i) => selected.has(i.handle));
    setPhase("importing");
    setProgress({ done: 0, total: picks.length });
    let done = 0;
    for (const item of picks) {
      try {
        const productUrl = `${origin}/products/${item.handle}`;
        const scraped = await scrapeProduct(productUrl);
        // Bulk imports silently skip rows already in the collection. The
        // one-off URL import path handles dedup interactively; here a prompt
        // per item would be disruptive.
        const dup = await findDuplicate({
          sourceUrl: scraped.sourceUrl,
          title: scraped.title,
          brand: scraped.brand,
        });
        if (dup) continue;
        await createPainting({ ...scraped, status: "wishlist" });
      } catch {
        // Skip failures silently — better to import the rest than fail the batch.
      } finally {
        done += 1;
        setProgress({ done, total: picks.length });
      }
    }

    // Persist the wishlist source so the user can refresh it later. We
    // snapshot every handle the scraper saw (not just the picks) — the
    // snapshot is what future refreshes diff against, so a partial pick
    // shouldn't make every unselected item look "newly added" next time.
    try {
      const lid = extractLid(url.trim());
      if (lid) {
        await wishlistSourcesApi.putSource({
          id: lid,
          url: url.trim(),
          name: deriveSourceName(url.trim(), lid),
          snapshotHandles: items.map((i) => i.handle),
        });
      }
    } catch (err) {
      // Non-fatal — paintings are already in the user's collection. Worst
      // case the user just doesn't get the refresh affordance for this list.
      console.warn("[wishlist-import] failed to persist source", err);
    }

    setPhase("done");
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
          <Heading color={palette.text}>Import wishlist</Heading>
          <Text color={palette.textMuted}>
            Open your Diamond Art Club wishlist in a browser, tap{" "}
            <Text color={palette.text} fontWeight="$semibold">Share</Text>, and
            paste the link below. You can also paste a single product URL —
            we&apos;ll send you to the one-off import flow.
          </Text>

          <Field label="Wishlist share or product URL">
            <Input
              bg={palette.surface}
              borderColor={palette.border}
              $focus-borderColor={palette.teal}
            >
              <InputField
                color={palette.text}
                placeholderTextColor={palette.textSubtle}
                placeholder="Paste a DAC share or product URL"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={phase === "input"}
              />
            </Input>
          </Field>

          {phase === "input" ? (
            <Button
              bg={palette.teal}
              onPress={startLoad}
              isDisabled={!url.trim()}
            >
              <ButtonText>Load wishlist</ButtonText>
            </Button>
          ) : null}

          {error ? (
            <Box
              bg={`${palette.danger}15`}
              borderRadius="$md"
              borderWidth={1}
              borderColor={palette.danger}
              p="$3"
            >
              <Text color={palette.danger} selectable size="xs">
                {error}
              </Text>
            </Box>
          ) : null}

          {phase === "loading" ? (
            <VStack space="sm" alignItems="center" py="$6">
              <Text color={palette.textMuted}>Loading wishlist…</Text>
              <Text size="xs" color={palette.textSubtle}>
                Waiting for the page to render. This can take 5-15 seconds.
              </Text>
            </VStack>
          ) : null}

          {phase === "review" ? (
            <VStack space="sm">
              <HStack justifyContent="space-between" alignItems="center">
                <Text color={palette.text} fontWeight="$semibold">
                  Found {items.length} item{items.length === 1 ? "" : "s"}
                </Text>
                <HStack space="sm">
                  <Pressable
                    onPress={() => setSelected(new Set(items.map((i) => i.handle)))}
                  >
                    <Text size="sm" color={palette.teal}>
                      All
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setSelected(new Set())}>
                    <Text size="sm" color={palette.teal}>
                      None
                    </Text>
                  </Pressable>
                </HStack>
              </HStack>

              {items.map((item) => (
                <ItemRow
                  key={item.handle}
                  item={item}
                  selected={selected.has(item.handle)}
                  onToggle={() => toggle(item.handle)}
                />
              ))}

              <Button
                bg={palette.purple}
                onPress={importSelected}
                isDisabled={selected.size === 0}
                mt="$2"
              >
                <ButtonText>
                  Import {selected.size} to wishlist
                </ButtonText>
              </Button>
            </VStack>
          ) : null}

          {phase === "importing" ? (
            <VStack space="sm" alignItems="center" py="$6">
              <Text color={palette.textMuted}>
                Importing… {progress.done} / {progress.total}
              </Text>
              <Text size="xs" color={palette.textSubtle}>
                Fetching product details for each item.
              </Text>
            </VStack>
          ) : null}

          {phase === "done" ? (
            <VStack space="md" alignItems="center" py="$6">
              <Ionicons name="checkmark-circle" size={48} color={palette.success} />
              <Text color={palette.text} fontWeight="$semibold">
                Imported {progress.done} item{progress.done === 1 ? "" : "s"}.
              </Text>
              <Button
                bg={palette.purple}
                onPress={() => router.replace("/(tabs)/wishlist")}
              >
                <ButtonText>View wishlist</ButtonText>
              </Button>
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>

      {/* Hidden WebView — only mounted while loading. Off-screen but kept
          functional via 1px size; setting display:none stops some sites
          from rendering JS-injected content. */}
      {phase === "loading" ? (
        <Box style={styles.hiddenWebview} pointerEvents="none">
          <WebView
            ref={webviewRef}
            source={{ uri: url.trim() }}
            injectedJavaScript={INJECTED_JS}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            // Dev-only: lets us inspect this WebView from desktop Chrome via
            // chrome://inspect when the device is connected over USB.
            webviewDebuggingEnabled={__DEV__}
            originWhitelist={["*"]}
            // Pretend to be a desktop UA — Swym sometimes serves a stripped
            // mobile experience that hides the wishlist grid.
            userAgent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
          />
        </Box>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function ItemRow({
  item,
  selected,
  onToggle,
}: {
  item: ScrapedItem;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      bg={palette.surface}
      borderRadius="$md"
      borderWidth={1}
      borderColor={selected ? palette.teal : palette.border}
      overflow="hidden"
    >
      <HStack space="sm" alignItems="center">
        <Box width={56} height={56} bg={palette.surfaceAlt}>
          {item.image ? (
            <Image
              source={{ uri: item.image }}
              style={{ width: 56, height: 56 }}
              contentFit="cover"
            />
          ) : null}
        </Box>
        <Box flex={1} pr="$3">
          <Text color={palette.text} numberOfLines={1}>
            {item.title}
          </Text>
          <Text size="xs" color={palette.textSubtle} numberOfLines={1}>
            {item.handle}
          </Text>
        </Box>
        <Box pr="$3">
          <Ionicons
            name={selected ? "checkmark-circle" : "ellipse-outline"}
            size={22}
            color={selected ? palette.teal : palette.textSubtle}
          />
        </Box>
      </HStack>
    </Pressable>
  );
}

// Pull the DAC list id out of the share URL. DAC's "Share List" button emits
// /pages/swym-share-wishlist?hkey=<lid>&lid=<lid>&utm_*; either param is the
// same UUID. Returns null for URLs we don't recognize.
function extractLid(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    return u.searchParams.get("hkey") ?? u.searchParams.get("lid");
  } catch {
    return null;
  }
}

// Friendly default name for the stored source. Uses the URL's hostname plus
// a short id suffix so multiple lists from the same site stay distinguishable.
function deriveSourceName(rawUrl: string, lid: string): string {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "");
    return `${host} wishlist (${lid.slice(0, 6)})`;
  } catch {
    return `Wishlist ${lid.slice(0, 6)}`;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 16, paddingBottom: 32 },
  // Off-screen but functional. Avoid display:none — some sites skip
  // layout-dependent JS work when the document isn't visible.
  hiddenWebview: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -10,
    top: -10,
  },
});
