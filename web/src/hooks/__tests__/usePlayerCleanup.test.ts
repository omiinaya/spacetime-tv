/**
 * Tests for usePlayerCleanup utilities — destroyAll, destroyAllExcept.
 *
 * These are pure functions that operate on PlayerRefs, making them
 * straightforward to unit-test without React rendering.
 */
import { describe, it, expect, vi } from "vitest";
import { destroyAll, destroyAllExcept } from "@/hooks/usePlayerCleanup";
import type { PlayerRefs } from "@/hooks/usePlayerCleanup";

/** Create a mock PlayerRefs with all destroy/cleanup fns as spies */
function createMockRefs(): PlayerRefs {
  return {
    mpegtsCleanupRef: { current: vi.fn() },
    mpegtsPlayerRef: { current: { destroy: vi.fn() } },
    hlsCleanupRef: { current: vi.fn() },
    subHlsRef: { current: { destroy: vi.fn() } },
    remuxCleanupRef: { current: vi.fn() },
    remuxPlayerRef: { current: { destroy: vi.fn() } },
    shakaCleanupRef: { current: vi.fn() },
    shakaPlayerRef: { current: { destroy: vi.fn() } },
  };
}

/** Create empty refs (some/all null) */
function createNullRefs(): PlayerRefs {
  return {
    mpegtsCleanupRef: { current: null },
    mpegtsPlayerRef: { current: null },
    hlsCleanupRef: { current: null },
    subHlsRef: { current: null },
    remuxCleanupRef: { current: null },
    remuxPlayerRef: { current: null },
    shakaCleanupRef: { current: null },
    shakaPlayerRef: { current: null },
  };
}

// ── destroyAll ────────────────────────────────────────────────

describe("destroyAll", () => {
  it("destroys all 4 players (cleanup cb + instance destroy)", () => {
    const refs = createMockRefs();

    destroyAll(refs);

    // All cleanup callbacks called
    expect(refs.mpegtsCleanupRef.current).toBeNull();
    expect(refs.mpegtsPlayerRef.current).toBeNull();
    expect(refs.hlsCleanupRef.current).toBeNull();
    expect(refs.subHlsRef.current).toBeNull();
    expect(refs.remuxCleanupRef.current).toBeNull();
    expect(refs.remuxPlayerRef.current).toBeNull();
    expect(refs.shakaCleanupRef.current).toBeNull();
    expect(refs.shakaPlayerRef.current).toBeNull();
  });

  it("handles already-null refs without error", () => {
    const refs = createNullRefs();

    expect(() => destroyAll(refs)).not.toThrow();
    // All should remain null
    expect(refs.mpegtsPlayerRef.current).toBeNull();
    expect(refs.subHlsRef.current).toBeNull();
    expect(refs.remuxPlayerRef.current).toBeNull();
    expect(refs.shakaPlayerRef.current).toBeNull();
  });

  it("calls all 4 destroy methods on player instances", () => {
    const refs = createMockRefs();

    destroyAll(refs);

    // All pointers should be null after cleanup
    expect(refs.mpegtsPlayerRef.current).toBeNull();
    expect(refs.subHlsRef.current).toBeNull();
    expect(refs.remuxPlayerRef.current).toBeNull();
    expect(refs.shakaPlayerRef.current).toBeNull();
  });

  it("calls cleanup callbacks before destroying instances", () => {
    const order: string[] = [];
    const refs = createMockRefs();
    refs.mpegtsCleanupRef.current = vi.fn(() => order.push("mpegts-cleanup"));
    refs.mpegtsPlayerRef.current = {
      destroy: vi.fn(() => order.push("mpegts-destroy")),
    };
    refs.hlsCleanupRef.current = vi.fn(() => order.push("hls-cleanup"));
    refs.subHlsRef.current = {
      destroy: vi.fn(() => order.push("hls-destroy")),
    };

    destroyAll(refs);

    expect(order).toContain("mpegts-cleanup");
    expect(order.indexOf("mpegts-cleanup")).toBeLessThan(
      order.indexOf("mpegts-destroy"),
    );
  });

  it("tolerates destroy throwing", () => {
    const refs = createMockRefs();
    refs.mpegtsPlayerRef.current = {
      destroy: vi.fn(() => {
        throw new Error("destroy failed");
      }),
    };

    expect(() => destroyAll(refs)).not.toThrow();
    expect(refs.mpegtsPlayerRef.current).toBeNull();
  });

  it("tolerates cleanup callback throwing", () => {
    const refs = createMockRefs();
    refs.mpegtsCleanupRef.current = vi.fn(() => {
      throw new Error("cleanup failed");
    });

    expect(() => destroyAll(refs)).not.toThrow();
    expect(refs.mpegtsCleanupRef.current).toBeNull();
  });

  it("clears all refs to null after destruction", () => {
    const refs = createMockRefs();

    destroyAll(refs);

    const allNull = Object.values(refs).every(
      (ref) => (ref as { current: unknown }).current === null,
    );
    expect(allNull).toBe(true);
  });
});

// ── destroyAllExcept ──────────────────────────────────────────

describe("destroyAllExcept", () => {
  it("destroys all except mpegts when keep='mpegts'", () => {
    const refs = createMockRefs();

    destroyAllExcept(refs, "mpegts");

    // mpegts should be preserved
    expect(refs.mpegtsCleanupRef.current).not.toBeNull();
    expect(refs.mpegtsPlayerRef.current).not.toBeNull();
    // Others destroyed
    expect(refs.hlsCleanupRef.current).toBeNull();
    expect(refs.subHlsRef.current).toBeNull();
    expect(refs.remuxCleanupRef.current).toBeNull();
    expect(refs.remuxPlayerRef.current).toBeNull();
    expect(refs.shakaCleanupRef.current).toBeNull();
    expect(refs.shakaPlayerRef.current).toBeNull();
  });

  it("destroys all except remux when keep='remux'", () => {
    const refs = createMockRefs();

    destroyAllExcept(refs, "remux");

    expect(refs.remuxCleanupRef.current).not.toBeNull();
    expect(refs.remuxPlayerRef.current).not.toBeNull();
    expect(refs.mpegtsCleanupRef.current).toBeNull();
    expect(refs.mpegtsPlayerRef.current).toBeNull();
    expect(refs.hlsCleanupRef.current).toBeNull();
    expect(refs.subHlsRef.current).toBeNull();
    expect(refs.shakaCleanupRef.current).toBeNull();
    expect(refs.shakaPlayerRef.current).toBeNull();
  });

  it("destroys all except hls when keep='hls'", () => {
    const refs = createMockRefs();

    destroyAllExcept(refs, "hls");

    expect(refs.hlsCleanupRef.current).not.toBeNull();
    expect(refs.subHlsRef.current).not.toBeNull();
    expect(refs.mpegtsCleanupRef.current).toBeNull();
    expect(refs.mpegtsPlayerRef.current).toBeNull();
    expect(refs.remuxCleanupRef.current).toBeNull();
    expect(refs.remuxPlayerRef.current).toBeNull();
    expect(refs.shakaCleanupRef.current).toBeNull();
    expect(refs.shakaPlayerRef.current).toBeNull();
  });

  it("destroys all except shaka when keep='shaka'", () => {
    const refs = createMockRefs();

    destroyAllExcept(refs, "shaka");

    expect(refs.shakaCleanupRef.current).not.toBeNull();
    expect(refs.shakaPlayerRef.current).not.toBeNull();
    expect(refs.mpegtsCleanupRef.current).toBeNull();
    expect(refs.mpegtsPlayerRef.current).toBeNull();
    expect(refs.hlsCleanupRef.current).toBeNull();
    expect(refs.subHlsRef.current).toBeNull();
    expect(refs.remuxCleanupRef.current).toBeNull();
    expect(refs.remuxPlayerRef.current).toBeNull();
  });

  it("handles null refs gracefully", () => {
    const refs = createNullRefs();

    expect(() => destroyAllExcept(refs, "mpegts")).not.toThrow();
  });

  it("does not call cleanup or destroy on the kept player", () => {
    const refs = createMockRefs();

    destroyAllExcept(refs, "mpegts");

    // Preserved player should retain its functions
    expect(typeof refs.mpegtsCleanupRef.current).toBe("function");
    expect(typeof refs.mpegtsPlayerRef.current?.destroy).toBe("function");
  });

  it("tolerates destroyed instance on kept player type", () => {
    const refs = createMockRefs();
    refs.mpegtsPlayerRef.current = null;
    refs.mpegtsCleanupRef.current = null;

    destroyAllExcept(refs, "mpegts");

    expect(refs.mpegtsPlayerRef.current).toBeNull();
    // Others still destroyed
    expect(refs.subHlsRef.current).toBeNull();
  });
});
