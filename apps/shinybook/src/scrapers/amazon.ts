// Amazon product scraping. Best-effort: Amazon serves real HTML for product
// detail pages but actively blocks bot-like requests, so we may receive a
// captcha/bot-check page. We send a browser-ish UA + Accept-Language and
// detect bot-block responses to surface a useful error.
//
// CORS caveat: Amazon does not set permissive CORS headers, so this scraper
// only works on native (mobile) where fetch() bypasses CORS. On web the
// request will fail at the network layer; user can fall back to manual entry.
//
// What we extract (best-effort, all optional):
//   - title           from <span id="productTitle">
//   - coverImage      from id="landingImage" (data-old-hires preferred)
//   - brand           from <a id="bylineInfo"> ("Visit the X Store" / "Brand: X")
//   - price           from #corePriceDisplay_desktop_feature_div .a-offscreen
//   - description     from #feature-bullets
//   - canvasSize      from title regex (e.g. 12x16, 30cm x 40cm)
//   - drillShape      from title/bullets regex (round / square / specialty)

import type { ScrapedPainting, DrillShape } from "../types/painting";
import type { ProductScraper } from "./types";
import { stripHtml } from "./shopify";

const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

function isAmazonHost(host: string): boolean {
  // amazon.com, amazon.ca, amazon.co.uk, smile.amazon.com, www.amazon.de, etc.
  const h = host.replace(/^www\./, "").replace(/^smile\./, "");
  return h === "amazon.com" || h.startsWith("amazon.") || h.endsWith(".amazon.com");
}

interface ParsedAmazonUrl {
  origin: string;
  asin: string;
}

function parseAmazonUrl(url: string): ParsedAmazonUrl | null {
  try {
    const u = new URL(url);
    if (!isAmazonHost(u.host)) return null;
    const m = u.pathname.match(ASIN_RE);
    if (!m) return null;
    return {
      origin: `${u.protocol}//${u.host}`,
      asin: m[1].toUpperCase(),
    };
  } catch {
    return null;
  }
}

// Look like Chrome on macOS so Amazon serves the normal product HTML rather
// than the captcha/bot-block page.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function isBotBlockPage(html: string): boolean {
  // Amazon's captcha page is small and includes one of these markers.
  return (
    /Sorry, we just need to make sure you're not a robot/i.test(html) ||
    /To discuss automated access to Amazon data please contact/i.test(html) ||
    /api-services-support@amazon\.com/i.test(html) ||
    /captcha/i.test(html.slice(0, 4000))
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

// Pull the inner text of an element matched by a custom regex of the opening
// tag. Returns the trimmed innerHTML (caller can stripHtml/decode further).
function matchInner(html: string, openTagRe: RegExp): string | undefined {
  const open = openTagRe.exec(html);
  if (!open) return undefined;
  // Find the matching close tag for the same element name. We don't try to
  // balance nested tags — Amazon's target elements are leaf-ish.
  const tagName = /<([a-z0-9]+)/i.exec(open[0])?.[1];
  if (!tagName) return undefined;
  const closeRe = new RegExp(`</${tagName}\\s*>`, "i");
  const after = html.slice(open.index + open[0].length);
  const close = closeRe.exec(after);
  if (!close) return undefined;
  return after.slice(0, close.index).trim();
}

function extractTitle(html: string): string | undefined {
  const inner = matchInner(html, /<span\b[^>]*id=["']productTitle["'][^>]*>/i);
  if (!inner) return undefined;
  const raw = decodeEntities(stripHtml(inner)).trim();
  return normalizeAmazonTitle(raw) || undefined;
}

// Strip the brand prefix DAC stamps on Amazon listings and drop the generic
// "Diamond Painting Kit …" suffix that follows the actual painting name.
//   "DIAMOND ART CLUB Rainbow Galaxy-Bear Diamond Painting Kit, Fun DIY …"
//     → "Rainbow Galaxy-Bear"
function normalizeAmazonTitle(title: string): string {
  // 1. Strip leading brand prefix (all-caps variant DAC uses on Amazon).
  let t = title.replace(/^DIAMOND\s+ART\s+CLUB\s+/i, "").trim();
  // 2. Find "Diamond Painting Kit" (preceded by any combo of spaces/punctuation)
  //    and drop it plus everything after. Use search() so we can slice cleanly.
  const kitIdx = t.search(/\s*[,\-–—|]?\s*Diamond\s+Painting\s+Kit\b/i);
  if (kitIdx > 0) t = t.slice(0, kitIdx).trim();
  return t;
}

function extractCoverImage(html: string): string | undefined {
  // Prefer #landingImage's data-old-hires (full-res) when present; fall back
  // to the first URL in data-a-dynamic-image (a JSON object keyed by URL).
  const tagOpen = /<img\b[^>]*id=["']landingImage["'][^>]*>/i.exec(html);
  if (!tagOpen) return undefined;
  const tag = tagOpen[0];

  const oldHires = /data-old-hires=["']([^"']+)["']/i.exec(tag);
  if (oldHires?.[1]) return oldHires[1];

  const dyn = /data-a-dynamic-image=["']([^"']+)["']/i.exec(tag);
  if (dyn?.[1]) {
    try {
      const obj = JSON.parse(decodeEntities(dyn[1])) as Record<string, unknown>;
      const first = Object.keys(obj)[0];
      if (first) return first;
    } catch {
      // fall through
    }
  }

  const src = /\bsrc=["']([^"']+)["']/i.exec(tag);
  return src?.[1];
}

function extractBrand(html: string): string | undefined {
  const inner = matchInner(html, /<a\b[^>]*id=["']bylineInfo["'][^>]*>/i);
  if (!inner) return undefined;
  const text = decodeEntities(stripHtml(inner)).trim();
  // Common patterns:
  //   "Visit the FOO Store" → FOO
  //   "Brand: FOO"          → FOO
  //   "FOO"                 → FOO
  const visit = /Visit the\s+(.+?)\s+Store/i.exec(text);
  if (visit) return visit[1].trim();
  const brand = /Brand:\s*(.+)$/i.exec(text);
  if (brand) return brand[1].trim();
  return text || undefined;
}

function extractPrice(html: string): { price?: number; currency?: string } {
  // Try the canonical price block first; fall back to any .a-offscreen on the
  // page (Amazon hides the screen-reader copy of the price there).
  const blocks = [
    /<div\b[^>]*id=["']corePriceDisplay_desktop_feature_div["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*id=["']corePrice_feature_div["'][^>]*>([\s\S]*?)<\/div>/i,
  ];
  let scope: string | undefined;
  for (const re of blocks) {
    const m = re.exec(html);
    if (m) {
      scope = m[1];
      break;
    }
  }
  const search = scope ?? html;
  const m = /<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)\s*<\/span>/i.exec(
    search,
  );
  if (!m) return {};
  const raw = decodeEntities(m[1]).trim();
  // Examples: "$24.99", "CDN$ 39.99", "£18.50"
  const num = /([\d.,]+)/.exec(raw);
  const symbol = /^([^\d.,\s]+)/.exec(raw)?.[1]?.trim();
  if (!num) return {};
  const price = parseFloat(num[1].replace(/,/g, ""));
  if (!Number.isFinite(price)) return {};
  return { price, currency: symbol };
}

function extractDescription(html: string): string | undefined {
  const inner = matchInner(html, /<div\b[^>]*id=["']feature-bullets["'][^>]*>/i);
  if (!inner) return undefined;
  // Each bullet is an <li><span class="a-list-item">...</span></li>. Strip
  // tags and decode; collapse runs of whitespace into single newlines.
  const text = decodeEntities(stripHtml(inner));
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : undefined;
}

// "12x16 inch", "12 x 16 in", "30cm x 40cm", "30 × 40 cm"
const SIZE_RE =
  /(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(in(?:ch(?:es)?)?|cm|mm)?/i;

function extractCanvasSize(...candidates: (string | undefined)[]): string | undefined {
  for (const text of candidates) {
    if (!text) continue;
    const m = SIZE_RE.exec(text);
    if (!m) continue;
    const unit = (m[3] ?? "in").toLowerCase().startsWith("cm")
      ? "cm"
      : m[3]?.toLowerCase().startsWith("mm")
        ? "mm"
        : "in";
    return `${m[1]}${unit === "in" ? '"' : unit} x ${m[2]}${unit === "in" ? '"' : unit}`;
  }
  return undefined;
}

function extractDrillShape(...candidates: (string | undefined)[]): DrillShape | undefined {
  for (const text of candidates) {
    if (!text) continue;
    const t = text.toLowerCase();
    // "Full Square Drill" / "Square Drill Diamond Painting"
    if (/\bsquare\s+(drill|diamond)/i.test(text)) return "square";
    if (/\bround\s+(drill|diamond)/i.test(text)) return "round";
    if (/\bspecialty\s+(drill|shape)/i.test(text)) return "specialty";
    // Loose fallback when only the shape word appears in a drill context.
    if (/\bfull\s+drill\b/i.test(text) && t.includes("square")) return "square";
    if (/\bfull\s+drill\b/i.test(text) && t.includes("round")) return "round";
  }
  return undefined;
}

export const amazonProductScraper: ProductScraper = {
  handles(url: string) {
    return parseAmazonUrl(url) !== null;
  },
  async fetchProduct(url: string): Promise<ScrapedPainting> {
    const parsed = parseAmazonUrl(url);
    if (!parsed) throw new Error(`Not a recognizable Amazon product URL: ${url}`);
    // Canonicalize so re-imports / dedup match across query-string variants.
    const canonical = `${parsed.origin}/dp/${parsed.asin}`;

    let res: Response;
    try {
      res = await fetch(canonical, { headers: BROWSER_HEADERS });
    } catch (err: any) {
      // Most likely cause on web: CORS. On native: network error.
      throw new Error(
        `Couldn't reach Amazon. ${err?.message ?? ""}\nTry on the mobile app, or add the painting manually.`.trim(),
      );
    }
    if (!res.ok) {
      throw new Error(`Amazon fetch failed: ${res.status}`);
    }
    const html = await res.text();
    if (isBotBlockPage(html)) {
      throw new Error(
        "Amazon returned a bot-check page. Try again in a moment, open the link in your browser to clear the captcha, or add the painting manually.",
      );
    }

    const title = extractTitle(html);
    if (!title) {
      throw new Error(
        "Couldn't read the product title from the Amazon page. The layout may have changed — add manually instead.",
      );
    }

    const description = extractDescription(html);
    const { price, currency } = extractPrice(html);

    return {
      title,
      brand: extractBrand(html),
      sourceUrl: canonical,
      coverImage: extractCoverImage(html),
      description,
      price,
      currency,
      canvasSize: extractCanvasSize(title, description),
      drillShape: extractDrillShape(title, description),
    };
  },
};
