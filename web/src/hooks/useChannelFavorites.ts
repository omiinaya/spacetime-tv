import { useState, useCallback, useRef, useEffect } from "react";

const STORAGE_KEY = "stv_channel_favorites";

function loadFavorites(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set<number>(JSON.parse(raw));
  } catch {} // DOMException: storage quota
  return new Set<number>();
}

function saveFavorites(favorites: Set<number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch {} // DOMException: storage quota
}

/**
 * Hook for managing favorite Live TV channels.
 * Persisted to localStorage, deduplicated via Set<stream_id>.
 */
export function useChannelFavorites() {
  const [favorites, setFavorites] = useState<Set<number>>(loadFavorites);
  const favRef = useRef(favorites);
  favRef.current = favorites;

  // Persist whenever favorites change
  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const toggleFavorite = useCallback((streamId: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(streamId)) {
        next.delete(streamId);
      } else {
        next.add(streamId);
      }
      return next;
    });
  }, []);

  const isFavorite = useCallback((streamId: number): boolean => {
    return favRef.current.has(streamId);
  }, []);

  return { favorites, toggleFavorite, isFavorite };
}
