import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  extractPrefix,
  extractService,
  isAdultCategory,
  filterCategories,
  collectAllPrefixes,
  collectAllServices,
  type AppSettings,
} from "./settings";

const KEY = "stv_settings";
const KEY_OLD = "spacetimetv-settings";

describe("loadSettings / saveSettings", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("loads saved settings", () => {
    const custom: AppSettings = {
      languages: ["EN", "US"],
      hiddenCategories: ["cat_1"],
      showAdult: true,
      services: ["NETFLIX"],
    };
    saveSettings(custom);
    expect(loadSettings()).toEqual(custom);
  });

  it("falls back to old key when new key is missing", () => {
    const old: AppSettings = {
      languages: ["FR"],
      hiddenCategories: [],
      showAdult: false,
      services: [],
    };
    localStorage.setItem(KEY_OLD, JSON.stringify(old));
    expect(loadSettings()).toEqual(old);
  });

  it("new key takes precedence over old key", () => {
    localStorage.setItem(KEY_OLD, JSON.stringify({ languages: ["FR"], hiddenCategories: [], showAdult: false, services: [] }));
    const custom = { languages: ["EN"], hiddenCategories: [], showAdult: false, services: [] };
    saveSettings(custom);
    expect(loadSettings()).toEqual(custom);
  });

  it("merges partial settings with defaults", () => {
    localStorage.setItem(KEY, JSON.stringify({ languages: ["EN"] }));
    const loaded = loadSettings();
    expect(loaded.languages).toEqual(["EN"]);
    expect(loaded.hiddenCategories).toEqual([]);
    expect(loaded.showAdult).toBe(false);
    expect(loaded.services).toEqual([]);
  });

  it("handles corrupted JSON gracefully", () => {
    localStorage.setItem(KEY, "{{{corrupted");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("extractPrefix", () => {
  it("extracts 2-letter prefix with pipe", () => {
    expect(extractPrefix("US| ENTERTAINMENT")).toBe("US");
  });

  it("extracts 2-letter prefix with dash", () => {
    expect(extractPrefix("EN - DRAMA")).toBe("EN");
  });

  it("extracts 3-letter prefix with pipe", () => {
    expect(extractPrefix("USA| MOVIES")).toBe("USA");
  });

  it("returns null for no prefix", () => {
    expect(extractPrefix("ENTERTAINMENT")).toBeNull();
  });

  it("returns null for 4K| prefix", () => {
    expect(extractPrefix("4K| UHD")).toBeNull();
  });

  it("returns null for lowercase prefix", () => {
    expect(extractPrefix("en| drama")).toBeNull();
  });

  it("handles edge spacing variations", () => {
    expect(extractPrefix("FR|FILMS")).toBe("FR");
    expect(extractPrefix("DE -Filme")).toBe("DE");
  });
});

describe("extractService", () => {
  it("detects NETFLIX prefix", () => {
    expect(extractService("NETFLIX MOVIES 4K")).toBe("NETFLIX");
  });

  it("detects DISNEY+ prefix", () => {
    expect(extractService("DISNEY+ KIDS")).toBe("DISNEY+");
  });

  it("detects HBO prefix", () => {
    expect(extractService("HBO SERIES")).toBe("HBO");
  });

  it("detects APPLE TV+ prefix", () => {
    expect(extractService("APPLE TV+ ORIGINALS")).toBe("APPLE TV+");
  });

  it("detects CRUNCHYROLL prefix", () => {
    expect(extractService("CRUNCHYROLL ANIME")).toBe("CRUNCHYROLL");
  });

  it("returns null for unrecognised names", () => {
    expect(extractService("MYSTERY CHANNEL")).toBeNull();
  });

  it("is case-insensitive via uppercase conversion", () => {
    expect(extractService("netflix movies")).toBe("NETFLIX");
  });

  it("returns null for empty string", () => {
    expect(extractService("")).toBeNull();
  });
});

describe("isAdultCategory", () => {
  it("detects 'adult' keyword", () => {
    expect(isAdultCategory("Adult Channel")).toBe(true);
  });

  it("detects 'xxx'", () => {
    expect(isAdultCategory("XXX MOVIES")).toBe(true);
  });

  it("detects '18+'", () => {
    expect(isAdultCategory("18+ CONTENT")).toBe(true);
  });

  it("detects 'porn'", () => {
    expect(isAdultCategory("PORN CHANNEL")).toBe(true);
  });

  it("detects 'hentai'", () => {
    expect(isAdultCategory("Hentai Paradise")).toBe(true);
  });

  it("detects '🔞' emoji", () => {
    expect(isAdultCategory("🔞 Channel")).toBe(true);
  });

  it("returns false for safe content", () => {
    expect(isAdultCategory("Entertainment")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAdultCategory("")).toBe(false);
  });
});

describe("filterCategories", () => {
  const categories = [
    { category_id: "1", category_name: "US| ENTERTAINMENT" },
    { category_id: "2", category_name: "EN| DRAMA" },
    { category_id: "3", category_name: "FR| FILMS" },
    { category_id: "4", category_name: "NETFLIX MOVIES" },
    { category_id: "5", category_name: "ADULT CHANNEL" },
    { category_id: "6", category_name: "KIDS" },
    { category_id: "7", category_name: "US| SPORTS" },
  ];

  const allOn: AppSettings = {
    languages: [],
    hiddenCategories: [],
    showAdult: true,
    services: [],
  };

  it("returns all categories when no filters active", () => {
    expect(filterCategories(categories, allOn)).toHaveLength(7);
  });

  // ── Adult filter ───────────────────────────────────────

  it("filters out adult categories when showAdult is false", () => {
    const filtered = filterCategories(categories, { ...allOn, showAdult: false });
    expect(filtered).not.toContainEqual(categories[4]);
    expect(filtered).toHaveLength(6);
  });

  // ── Hidden categories ──────────────────────────────────

  it("filters out hidden categories by id", () => {
    const filtered = filterCategories(categories, { ...allOn, hiddenCategories: ["2", "6"] });
    expect(filtered).not.toContainEqual(categories[1]);
    expect(filtered).not.toContainEqual(categories[5]);
    expect(filtered).toHaveLength(5);
  });

  // ── Language filter (non-live) ─────────────────────────

  it("filters by language prefix for non-live TV", () => {
    const filtered = filterCategories(categories, { ...allOn, languages: ["US"], showAdult: false }, false);
    // US| ENTERTAINMENT, US| SPORTS should pass (matching prefix)
    // NETFLIX MOVIES, KIDS should pass (no prefix — services empty, so pass)
    // EN| DRAMA and FR| FILMS should be filtered (wrong prefix)
    // ADULT CHANNEL filtered by adult filter
    // US| ENTERTAINMENT, US| SPORTS should pass; also no-prefix categories (NETFLIX, KIDS)
    expect(filtered).toContainEqual(categories[0]); // US|
    expect(filtered).toContainEqual(categories[6]); // US| SPORTS
    expect(filtered).toContainEqual(categories[3]); // NETFLIX (no prefix)
    expect(filtered).toContainEqual(categories[5]); // KIDS (no prefix)
    expect(filtered).not.toContainEqual(categories[1]); // EN|
    expect(filtered).not.toContainEqual(categories[2]); // FR|
    expect(filtered).toHaveLength(4);
  });

  // ── Language filter (live TV) ──────────────────────────

  it("for live TV, no-prefix categories are always kept", () => {
    const filtered = filterCategories(categories, { ...allOn, languages: ["US"], showAdult: false }, true);
    // Same as above plus NETFLIX and KIDS (no-prefix) pass
    expect(filtered).toContainEqual(categories[0]); // US|
    expect(filtered).toContainEqual(categories[3]); // NETFLIX (no prefix)
    expect(filtered).toContainEqual(categories[5]); // KIDS (no prefix)
    expect(filtered).toContainEqual(categories[6]); // US| SPORTS
    expect(filtered).toHaveLength(4);
  });

  // ── Service filter (non-live) ──────────────────────────

  it("filters by service prefix for non-live TV", () => {
    const filtered = filterCategories(categories, { ...allOn, services: ["NETFLIX"], showAdult: false }, false);
    // NETFLIX MOVIES should pass (matches service). No-prefix categories (KIDS) pass.
    // Categories with language prefixes (US|, EN|, FR|) have no service prefix and pass.
    expect(filtered).toContainEqual(categories[3]); // NETFLIX
    expect(filtered).toContainEqual(categories[5]); // KIDS (no prefix)
    expect(filtered).toContainEqual(categories[0]); // US| (no service prefix)
    expect(filtered).toHaveLength(6); // all except ADULT
  });

  it("filters out non-matching service categories", () => {
    const cats = [
      { category_id: "a", category_name: "NETFLIX MOVIES" },
      { category_id: "b", category_name: "HBO SERIES" },
      { category_id: "c", category_name: "KIDS" },
    ];
    const filtered = filterCategories(cats, { ...allOn, services: ["NETFLIX"] }, false);
    expect(filtered).toContainEqual(cats[0]); // NETFLIX
    expect(filtered).toContainEqual(cats[2]); // KIDS (no service prefix)
    expect(filtered).not.toContainEqual(cats[1]); // HBO
    expect(filtered).toHaveLength(2);
  });

  // ── Combined filters ───────────────────────────────────

  it("combines adult + language filter correctly", () => {
    const filtered = filterCategories(categories, {
      languages: ["US"],
      hiddenCategories: [],
      showAdult: false,
      services: [],
    }, false);
    // Should have US| ENTERTAINMENT, US| SPORTS, NETFLIX, KIDS = 4
    expect(filtered).toHaveLength(4);
    expect(filtered.every((c) => c.category_name !== "ADULT CHANNEL")).toBe(true);
  });

  it("combines adult + hidden categories correctly", () => {
    const filtered = filterCategories(categories, {
      languages: [],
      hiddenCategories: ["1", "7"],
      showAdult: false,
      services: [],
    }, false);
    expect(filtered).not.toContainEqual(categories[4]); // ADULT
    expect(filtered).not.toContainEqual(categories[0]); // US| ENTERTAINMENT (hidden)
    expect(filtered).not.toContainEqual(categories[6]); // US| SPORTS (hidden)
  });
});

describe("collectAllPrefixes", () => {
  it("collects unique prefixes from all category lists", () => {
    const live = [{ category_name: "US| NEWS" }];
    const movies = [{ category_name: "EN| MOVIES" }, { category_name: "US| FILMS" }];
    const series = [{ category_name: "FR| SERIES" }];
    expect(collectAllPrefixes(live, movies, series)).toEqual(["EN", "FR", "US"]);
  });

  it("returns empty array when no prefixes exist", () => {
    expect(collectAllPrefixes([], [], [])).toEqual([]);
  });

  it("ignores categories without prefixes", () => {
    const movies = [{ category_name: "NO PREFIX" }];
    expect(collectAllPrefixes([], movies, [])).toEqual([]);
  });
});

describe("collectAllServices", () => {
  it("collects unique services from movie and series categories", () => {
    const movies = [{ category_name: "NETFLIX MOVIES" }, { category_name: "HBO SERIES" }];
    const series = [{ category_name: "DISNEY+ KIDS" }, { category_name: "NETFLIX ANIME" }];
    expect(collectAllServices(movies, series)).toEqual(["DISNEY+", "HBO", "NETFLIX"]);
  });

  it("returns empty array when no services", () => {
    const movies = [{ category_name: "KIDS" }];
    expect(collectAllServices(movies, [])).toEqual([]);
  });

  it("is case-insensitive", () => {
    const movies = [{ category_name: "netflix movies" }];
    expect(collectAllServices(movies, [])).toEqual(["NETFLIX"]);
  });
});
