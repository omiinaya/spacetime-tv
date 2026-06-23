// ── App Settings: persistent filters for reducing IPTV noise ────────────────

export interface AppSettings {
  /** Language/country prefixes to show (empty = show all). E.g. ["EN", "US", "UK"] */
  languages: string[];
  /** Category IDs to hide */
  hiddenCategories: string[];
  /** Show categories flagged as adult */
  showAdult: boolean;
  /** Service prefixes to show for movies/series (empty = show all). E.g. ["NETFLIX", "DISNEY+"] */
  services: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  languages: [],
  hiddenCategories: [],
  showAdult: false,
  services: [],
};

const KEY = "stv_settings";
const KEY_OLD = "spacetimetv-settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(KEY_OLD);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

// ── Category filter helpers ─────────────────────────────────────────────────

const ADULT_KEYWORDS = [
  "adult", "xxx", "18+", "erotic", "porn", "sex", "hentai",
  "+18", "18+", "21+", "🔞",
];

const SERVICE_PREFIXES = [
  "NETFLIX", "DISNEY+", "AMAZON", "HBO", "HULU", "APPLE TV+",
  "OSN+", "CRUNCHYROLL", "DISCOVERY+", "PARAMOUNT+", "PEACOCK",
  "STARZ", "SHOWTIME", "SHAHID",
];

/** Extract the 2-3 letter language/country prefix from a category name.
 *  "US| ENTERTAINMENT" → "US", "EN - DRAMA" → "EN", "4K| UHD" → null */
export function extractPrefix(name: string): string | null {
  const m = name.match(/^([A-Z]{2,3})\s*[\|\-]\s*/);
  return m ? m[1] : null;
}

/** Extract service prefix from category name.
 *  "NETFLIX MOVIES 4K" → "NETFLIX", "DISNEY+ KIDS" → "DISNEY+" */
export function extractService(name: string): string | null {
  const upper = name.toUpperCase();
  for (const svc of SERVICE_PREFIXES) {
    if (upper.startsWith(svc)) return svc;
  }
  return null;
}

/** Check if a category name suggests adult content */
export function isAdultCategory(name: string): boolean {
  const lower = name.toLowerCase();
  return ADULT_KEYWORDS.some((k) => lower.includes(k));
}

/** Filter categories based on settings. Returns filtered array. */
export function filterCategories<T extends { category_id: string; category_name: string }>(
  categories: T[],
  settings: AppSettings,
  isLiveTV: boolean = false,
): T[] {
  return categories.filter((cat) => {
    const name = cat.category_name;
    const nameUpper = name.toUpperCase();

    // Adult filter
    if (!settings.showAdult && isAdultCategory(name)) return false;

    // Hidden categories
    if (settings.hiddenCategories.includes(cat.category_id)) return false;

    // Language filter (only if user has selected languages)
    if (settings.languages.length > 0) {
      const prefix = extractPrefix(name);
      // Categories with a matching prefix pass
      if (prefix && settings.languages.includes(prefix)) return true;
      // Categories without ANY prefix are kept (they're service/special categories)
      if (!prefix) {
        // For live TV, no-prefix categories are always kept
        if (isLiveTV) return true;
        // For movies/series, check service filter
        if (settings.services.length > 0) {
          const svc = extractService(name);
          // If user has service filters, only show matching services
          // Otherwise show all non-prefixed
          return svc ? settings.services.includes(svc) : true;
        }
        return true;
      }
      // Has a prefix but not in the user's language list → hide
      return false;
    }

    // Service filter (movies/series only, when languages not filtering)
    if (!isLiveTV && settings.services.length > 0) {
      const svc = extractService(name);
      if (svc && !settings.services.includes(svc)) {
        // Only filter out if it HAS a service prefix and it's not selected
        // Non-service categories pass through
        return false;
      }
    }

    return true;
  });
}

/** Collect all unique prefixes from category lists across all content types */
export function collectAllPrefixes(
  liveCats: { category_name: string }[],
  movieCats: { category_name: string }[],
  seriesCats: { category_name: string }[],
): string[] {
  const seen = new Set<string>();
  for (const cats of [liveCats, movieCats, seriesCats]) {
    for (const c of cats) {
      const p = extractPrefix(c.category_name);
      if (p) seen.add(p);
    }
  }
  return Array.from(seen).sort();
}

/** Collect all unique service prefixes from movie/series categories */
export function collectAllServices(
  movieCats: { category_name: string }[],
  seriesCats: { category_name: string }[],
): string[] {
  const seen = new Set<string>();
  for (const cats of [movieCats, seriesCats]) {
    for (const c of cats) {
      const s = extractService(c.category_name);
      if (s) seen.add(s);
    }
  }
  return Array.from(seen).sort();
}
