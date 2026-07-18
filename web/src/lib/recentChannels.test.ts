import { describe, it, expect, beforeEach } from "vitest";
import {
  getRecentChannels,
  saveRecentChannel,
  clearRecentChannels,
} from "@/lib/recentChannels";
import type { RecentChannel } from "@/lib/recentChannels";

const KEY = "stv_recent_channels";

function setLocalStorage(data: RecentChannel[]) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

describe("getRecentChannels", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when localStorage is empty", () => {
    expect(getRecentChannels()).toEqual([]);
  });

  it("returns empty array when localStorage key is missing", () => {
    localStorage.removeItem(KEY);
    expect(getRecentChannels()).toEqual([]);
  });

  it("returns valid channels sorted by watchedAt descending", () => {
    const now = Date.now();
    const channels: RecentChannel[] = [
      { stream_id: 1, name: "BBC One", icon: "/bbc.png", watchedAt: now },
      { stream_id: 2, name: "CNN", icon: "/cnn.png", watchedAt: now - 1000 },
      {
        stream_id: 3,
        name: "Sky News",
        icon: "/sky.png",
        watchedAt: now - 2000,
      },
    ];
    setLocalStorage(channels);
    const result = getRecentChannels();
    expect(result).toHaveLength(3);
    // Should be sorted newest first
    expect(result[0].stream_id).toBe(1);
    expect(result[1].stream_id).toBe(2);
    expect(result[2].stream_id).toBe(3);
  });

  it("filters out channels older than 14 days", () => {
    const now = Date.now();
    const channels: RecentChannel[] = [
      { stream_id: 1, name: "Recent", icon: "", watchedAt: now },
      {
        stream_id: 2,
        name: "Expired",
        icon: "",
        watchedAt: now - 15 * 86400_000,
      },
      {
        stream_id: 3,
        name: "Borderline",
        icon: "",
        watchedAt: now - 13 * 86400_000,
      },
    ];
    setLocalStorage(channels);
    const result = getRecentChannels();
    expect(result).toHaveLength(2);
    expect(
      result.find((c: RecentChannel) => c.stream_id === 2),
    ).toBeUndefined();
  });

  it("returns max 12 items", () => {
    const now = Date.now();
    const channels: RecentChannel[] = Array.from({ length: 20 }, (_, i) => ({
      stream_id: i,
      name: `Channel ${i}`,
      icon: "",
      watchedAt: now - i * 1000,
    }));
    setLocalStorage(channels);
    const result = getRecentChannels();
    expect(result).toHaveLength(12);
  });

  it("returns empty array on corrupted JSON", () => {
    localStorage.setItem(KEY, "not valid json{{{");
    expect(getRecentChannels()).toEqual([]);
  });

  it("returns empty array on non-array JSON", () => {
    localStorage.setItem(KEY, JSON.stringify({ not: "an array" }));
    expect(getRecentChannels()).toEqual([]);
  });
});

describe("saveRecentChannel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves a new channel", () => {
    saveRecentChannel({ stream_id: 1, name: "BBC One", icon: "/bbc.png" });
    const result = getRecentChannels();
    expect(result).toHaveLength(1);
    expect(result[0].stream_id).toBe(1);
    expect(result[0].name).toBe("BBC One");
    expect(result[0].watchedAt).toBeGreaterThan(0);
    expect(typeof result[0].watchedAt).toBe("number");
  });

  it("deduplicates by stream_id (moves to front and updates timestamp)", () => {
    const now = Date.now();
    setLocalStorage([
      {
        stream_id: 1,
        name: "BBC One",
        icon: "/bbc.png",
        watchedAt: now - 5000,
      },
      { stream_id: 2, name: "CNN", icon: "/cnn.png", watchedAt: now - 10000 },
    ]);

    // Save existing channel with possibly updated name
    saveRecentChannel({
      stream_id: 1,
      name: "BBC One HD",
      icon: "/bbc-hd.png",
    });
    const result = getRecentChannels();
    expect(result).toHaveLength(2);
    // Deduped channel should be first (newest)
    expect(result[0].stream_id).toBe(1);
    expect(result[0].name).toBe("BBC One HD");
    expect(result[0].watchedAt).toBeGreaterThan(now - 5000);
  });

  it("keeps max 12 items by dropping oldest", () => {
    const now = Date.now();
    // Fill with 12 channels
    const channels: RecentChannel[] = Array.from({ length: 12 }, (_, i) => ({
      stream_id: i + 1,
      name: `Channel ${i + 1}`,
      icon: "",
      watchedAt: now - (12 - i) * 1000, // oldest = stream_id 1
    }));
    setLocalStorage(channels);

    // Add one more — should drop the oldest
    saveRecentChannel({ stream_id: 99, name: "New Channel", icon: "" });
    const result = getRecentChannels();
    expect(result).toHaveLength(12);
    expect(
      result.find((c: RecentChannel) => c.stream_id === 1),
    ).toBeUndefined();
    expect(result.find((c: RecentChannel) => c.stream_id === 99)).toBeDefined();
  });
});

describe("clearRecentChannels", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes the localStorage key", () => {
    setLocalStorage([
      { stream_id: 1, name: "Test", icon: "", watchedAt: Date.now() },
    ]);
    clearRecentChannels();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does not throw when already empty", () => {
    expect(() => clearRecentChannels()).not.toThrow();
  });
});
