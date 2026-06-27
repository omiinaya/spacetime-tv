import { describe, it, expect } from "vitest";
import { timeAgo } from "@/lib/utils";

describe("timeAgo", () => {
  it('returns empty string for null', () => {
    expect(timeAgo(null)).toBe("");
  });

  it('returns empty string for undefined', () => {
    expect(timeAgo(undefined)).toBe("");
  });

  it('returns empty string for 0', () => {
    expect(timeAgo(0)).toBe("");
  });

  it('returns empty string for negative values', () => {
    expect(timeAgo(-1000)).toBe("");
  });

  it('returns "Just now" for timestamps less than 5 seconds ago', () => {
    const now = Date.now();
    expect(timeAgo(now - 1000)).toBe("Just now");
    expect(timeAgo(now - 4000)).toBe("Just now");
    expect(timeAgo(now)).toBe("Just now");
  });

  it('returns "Xs ago" for 5-59 seconds', () => {
    const now = Date.now();
    expect(timeAgo(now - 5000)).toBe("5s ago");
    expect(timeAgo(now - 30000)).toBe("30s ago");
    expect(timeAgo(now - 59000)).toBe("59s ago");
  });

  it('returns "Xm ago" for 1-59 minutes', () => {
    const now = Date.now();
    expect(timeAgo(now - 60_000)).toBe("1m ago");
    expect(timeAgo(now - 5 * 60_000)).toBe("5m ago");
    expect(timeAgo(now - 59 * 60_000)).toBe("59m ago");
  });

  it('returns "Xh ago" for 1-23 hours', () => {
    const now = Date.now();
    expect(timeAgo(now - 60 * 60_000)).toBe("1h ago");
    expect(timeAgo(now - 5 * 60 * 60_000)).toBe("5h ago");
    expect(timeAgo(now - 23 * 60 * 60_000)).toBe("23h ago");
  });

  it('returns "Yesterday" for 24-47 hours', () => {
    const now = Date.now();
    expect(timeAgo(now - 24 * 60 * 60_000)).toBe("Yesterday");
    expect(timeAgo(now - 30 * 60 * 60_000)).toBe("Yesterday");
    expect(timeAgo(now - 47 * 60 * 60_000)).toBe("Yesterday");
  });

  it('returns "X days ago" for 2-29 days', () => {
    const now = Date.now();
    expect(timeAgo(now - 2 * 24 * 60 * 60_000)).toBe("2 days ago");
    expect(timeAgo(now - 7 * 24 * 60 * 60_000)).toBe("7 days ago");
    expect(timeAgo(now - 29 * 24 * 60 * 60_000)).toBe("29 days ago");
  });

  it('returns "Xmo ago" for 1-11 months (30-364 days)', () => {
    const now = Date.now();
    expect(timeAgo(now - 30 * 24 * 60 * 60_000)).toBe("1mo ago");
    expect(timeAgo(now - 90 * 24 * 60 * 60_000)).toBe("3mo ago");
    expect(timeAgo(now - 364 * 24 * 60 * 60_000)).toBe("12mo ago");
  });

  it('returns "Xy ago" for 1+ years', () => {
    const now = Date.now();
    expect(timeAgo(now - 365 * 24 * 60 * 60_000)).toBe("1y ago");
    expect(timeAgo(now - 2 * 365 * 24 * 60 * 60_000)).toBe("2y ago");
    expect(timeAgo(now - 10 * 365 * 24 * 60 * 60_000)).toBe("10y ago");
  });

  it('handles future timestamps gracefully (clamps to "Just now")', () => {
    const now = Date.now();
    expect(timeAgo(now + 5000)).toBe("Just now");
    expect(timeAgo(now + 3600_000)).toBe("Just now");
  });
});
