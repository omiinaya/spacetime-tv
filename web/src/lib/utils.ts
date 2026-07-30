import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind class names with conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a human-readable relative time string (e.g. "2m ago", "3h ago",
 * "Yesterday", "2 days ago"). Returns empty string for falsy/invalid timestamps.
 */
export function timeAgo(timestamp: number | null | undefined): string {
  if (!timestamp || typeof timestamp !== "number" || timestamp <= 0) return "";
  const now = Date.now();
  const diffMs = now - timestamp;
  // Clamp negative values (future timestamps) to 0
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Formats seconds into a human-readable duration string.
 * e.g. 3661 → "1h 1m", 900 → "15m", null → ""
 */
export function formatDuration(secs?: number | null): string {
  if (!secs || !Number.isFinite(secs) || secs <= 0) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
