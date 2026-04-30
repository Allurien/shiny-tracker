// Shared headless WebView scraper for DAC wishlist share URLs. Used by both
// the import flow (initial paste-and-pick) and the refresh flow (re-scrape an
// already-tracked source). The scraper itself is a hidden WebView that polls
// Swym's render container for product anchors and posts the discovered
// {handle, title, image} list back to RN.
//
// Native-only: react-native-webview has no web implementation. Web callers
// should branch before mounting <WishlistScraper /> and show their own
// fallback message.

import { Box } from "@gluestack-ui/themed";
import { useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export interface ScrapedItem {
  handle: string;
  title: string;
  image?: string;
}

export interface ScraperResult {
  items: ScrapedItem[];
  source: string | null;
  diagnostics: string[] | null;
}

// Polls the shared-wishlist render container for product anchors and posts
// them back to RN. Only the ?hkey=... share URL renders without a logged-in
// Swym session — the container populates client-side ~3-10s after load.
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

interface Props {
  url: string;
  onResult: (result: ScraperResult) => void;
  onParseError: (raw: string) => void;
}

// Mounts a 1px off-screen WebView that runs the injected scraper and reports
// the result via onResult. The 1px-and-opacity-0 trick is intentional —
// display:none would skip layout-dependent JS work on the page.
export function WishlistScraperView({ url, onResult, onParseError }: Props) {
  const webviewRef = useRef<WebView>(null);

  function handleMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as {
        type: string;
        items: ScrapedItem[];
        source?: string | null;
        diagnostics?: string[] | null;
      };
      if (msg.type === "result") {
        onResult({
          items: msg.items,
          source: msg.source ?? null,
          diagnostics: msg.diagnostics ?? null,
        });
      }
    } catch {
      onParseError(e.nativeEvent.data);
    }
  }

  return (
    <Box style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        injectedJavaScript={INJECTED_JS}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        webviewDebuggingEnabled={__DEV__}
        originWhitelist={["*"]}
        userAgent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    left: -10,
    top: -10,
  },
});

// Extract DAC's list id from a share URL. Both ?hkey=<lid> and ?lid=<lid>
// resolve to the same UUID — accept either so partially-mangled URLs still
// work. Returns null if the URL has neither.
export function extractLid(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    return u.searchParams.get("hkey") ?? u.searchParams.get("lid");
  } catch {
    return null;
  }
}

// Parse a Shopify product URL → handle. The painting `sourceUrl` we store on
// import is the canonical /products/<handle> form, so this is how we map a
// painting back to its DAC wishlist row for diff purposes.
export function handleFromProductUrl(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const u = new URL(sourceUrl);
    const m = u.pathname.match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
