import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChannelFavorites } from "../useChannelFavorites";

const STORAGE_KEY = "stv_channel_favorites";

describe("useChannelFavorites", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with empty favorites by default", () => {
    const { result } = renderHook(() => useChannelFavorites());
    expect(result.current.favorites.size).toBe(0);
  });

  it("loads persisted favorites from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    const { result } = renderHook(() => useChannelFavorites());
    expect(result.current.favorites.has(1)).toBe(true);
    expect(result.current.favorites.has(2)).toBe(true);
    expect(result.current.favorites.has(3)).toBe(true);
    expect(result.current.favorites.size).toBe(3);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "{[corrupted}");
    const { result } = renderHook(() => useChannelFavorites());
    expect(result.current.favorites.size).toBe(0);
  });

  it("toggleFavorite adds a channel", () => {
    const { result } = renderHook(() => useChannelFavorites());
    act(() => result.current.toggleFavorite(42));
    expect(result.current.favorites.has(42)).toBe(true);
    expect(result.current.favorites.size).toBe(1);
  });

  it("toggleFavorite removes a channel", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([42]));
    const { result } = renderHook(() => useChannelFavorites());
    expect(result.current.favorites.has(42)).toBe(true);
    act(() => result.current.toggleFavorite(42));
    expect(result.current.favorites.has(42)).toBe(false);
  });

  it("toggleFavorite re-adds after remove (toggle is not idempotent-remove)", () => {
    const { result } = renderHook(() => useChannelFavorites());
    act(() => result.current.toggleFavorite(1)); // add → size 1
    act(() => result.current.toggleFavorite(1)); // remove → size 0
    act(() => result.current.toggleFavorite(1)); // add → size 1 (re-adds!)
    expect(result.current.favorites.size).toBe(1);
    expect(result.current.favorites.has(1)).toBe(true);
  });

  it("handles multiple toggles", () => {
    const { result } = renderHook(() => useChannelFavorites());
    act(() => result.current.toggleFavorite(1));
    act(() => result.current.toggleFavorite(2));
    act(() => result.current.toggleFavorite(3));
    expect(result.current.favorites.size).toBe(3);
  });

  it("isFavorite returns true for favorited channel", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([10]));
    const { result } = renderHook(() => useChannelFavorites());
    expect(result.current.isFavorite(10)).toBe(true);
  });

  it("isFavorite returns false for non-favorited channel", () => {
    const { result } = renderHook(() => useChannelFavorites());
    expect(result.current.isFavorite(99)).toBe(false);
  });

  it("isFavorite uses ref so stale closures don't matter", () => {
    const { result, rerender } = renderHook(() => useChannelFavorites());
    const isFav = result.current.isFavorite;
    act(() => result.current.toggleFavorite(7));
    // This call uses the old reference but should still see updated state via the ref
    expect(isFav(7)).toBe(true);
  });

  it("persists to localStorage on toggle", () => {
    const { result } = renderHook(() => useChannelFavorites());
    act(() => result.current.toggleFavorite(5));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    expect(stored).toEqual([5]);
  });

  it("persists removal to localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([5, 10]));
    const { result } = renderHook(() => useChannelFavorites());
    act(() => result.current.toggleFavorite(5));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    expect(stored).toEqual([10]);
  });
});
