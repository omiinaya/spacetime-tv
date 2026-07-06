const KEY = "stv_recent_channels";
const MAX_ITEMS = 12;

export interface RecentChannel {
  stream_id: number;
  name: string;
  icon: string;
  watchedAt: number;
}

export function getRecentChannels(): RecentChannel[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const items: RecentChannel[] = JSON.parse(raw);
    // Filter out anything older than 14 days
    const cutoff = Date.now() - 14 * 86400_000;
    return items
      .filter((i) => i.watchedAt > cutoff)
      .sort((a, b) => b.watchedAt - a.watchedAt)
      .slice(0, MAX_ITEMS);
  } catch /* DOMException: localStorage quota */ {
    return [];
  }
}

export function saveRecentChannel(channel: { stream_id: number; name: string; icon: string }) {
  const items = getRecentChannels();
  const filtered = items.filter((i) => i.stream_id !== channel.stream_id);
  filtered.unshift({ ...channel, watchedAt: Date.now() });
  const trimmed = filtered.slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {} // DOMException: localStorage quota
}

export function clearRecentChannels() {
  try { localStorage.removeItem(KEY); } catch {} // DOMException: storage quota
}
