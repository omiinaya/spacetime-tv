import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSearchHistory, addSearchHistory, clearSearchHistory } from "./searchHistory";

const KEY = "stv_search_history";

describe("searchHistory", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  // ── getSearchHistory ────────────────────────────────────

  it("returns empty array when nothing stored", () => {
    expect(getSearchHistory()).toEqual([]);
  });

  it("returns empty array on corrupted JSON", () => {
    localStorage.setItem(KEY, "{{{garbage}}");
    expect(getSearchHistory()).toEqual([]);
  });

  it("returns empty array when stored value is not an array", () => {
    localStorage.setItem(KEY, JSON.stringify("not-array"));
    expect(getSearchHistory()).toEqual([]);
  });

  it("returns stored search history", () => {
    localStorage.setItem(KEY, JSON.stringify(["matrix", "inception"]));
    expect(getSearchHistory()).toEqual(["matrix", "inception"]);
  });

  it("caps at MAX (10) items", () => {
    const many = Array.from({ length: 20 }, (_, i) => `query-${i}`);
    localStorage.setItem(KEY, JSON.stringify(many));
    expect(getSearchHistory()).toHaveLength(10);
  });

  // ── addSearchHistory ────────────────────────────────────

  it("adds a search query to the start", () => {
    addSearchHistory("inception");
    expect(getSearchHistory()).toEqual(["inception"]);
  });

  it("prepends new queries to the front", () => {
    addSearchHistory("first");
    addSearchHistory("second");
    expect(getSearchHistory()).toEqual(["second", "first"]);
  });

  it("trims whitespace from queries", () => {
    addSearchHistory("  hello world  ");
    expect(getSearchHistory()).toEqual(["hello world"]);
  });

  it("ignores empty strings", () => {
    addSearchHistory("");
    expect(getSearchHistory()).toEqual([]);
  });

  it("ignores whitespace-only strings", () => {
    addSearchHistory("   ");
    expect(getSearchHistory()).toEqual([]);
  });

  it("ignores queries shorter than 2 characters", () => {
    addSearchHistory("a");
    expect(getSearchHistory()).toEqual([]);
  });

  it("allows exactly 2 character queries", () => {
    addSearchHistory("ab");
    expect(getSearchHistory()).toEqual(["ab"]);
  });

  it("deduplicates case-insensitively, keeping latest position", () => {
    addSearchHistory("matrix");
    addSearchHistory("inception");
    addSearchHistory("MATRIX");
    expect(getSearchHistory()).toEqual(["MATRIX", "inception"]);
  });

  it("caps at 10 items after adding", () => {
    for (let i = 0; i < 15; i++) {
      addSearchHistory(`query-${i}`);
    }
    expect(getSearchHistory()).toHaveLength(10);
    expect(getSearchHistory()[0]).toBe("query-14");
  });

  it("preserves the most recent 10 when overflowing", () => {
    for (let i = 0; i < 15; i++) {
      addSearchHistory(`q-${i}`);
    }
    const history = getSearchHistory();
    expect(history[history.length - 1]).toBe("q-5");
    expect(history).not.toContain("q-4"); // the 11th
  });

  // ── clearSearchHistory ──────────────────────────────────

  it("clears all history", () => {
    addSearchHistory("matrix");
    addSearchHistory("inception");
    clearSearchHistory();
    expect(getSearchHistory()).toEqual([]);
  });

  it("clear is idempotent", () => {
    clearSearchHistory();
    clearSearchHistory();
    expect(getSearchHistory()).toEqual([]);
  });

  it("add after clear works correctly", () => {
    addSearchHistory("old");
    clearSearchHistory();
    addSearchHistory("new");
    expect(getSearchHistory()).toEqual(["new"]);
  });
});
