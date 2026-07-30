/**
 * Tests for useDocumentPiP — Document Picture-in-Picture hook.
 *
 * Tests the utility function and graceful fallback behavior.
 * The full PiP window lifecycle involves complex browser APIs that
 * are difficult to mock in jsdom — we test the entry points and
 * error handling paths.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { isDocumentPiPSupported, useDocumentPiP } from "@/hooks/useDocumentPiP";

describe("isDocumentPiPSupported", () => {
  const originalWindow = global.window;

  afterEach(() => {
    Object.defineProperty(global, "window", {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it("returns false when window is undefined", () => {
    // @ts-expect-error — testing undefined window
    Object.defineProperty(global, "window", { value: undefined });
    expect(isDocumentPiPSupported()).toBe(false);
  });

  it("returns false when API not available", () => {
    expect(global.window.documentPictureInPicture).toBeUndefined();
    expect(isDocumentPiPSupported()).toBe(false);
  });

  it("returns true when API is available", () => {
    Object.defineProperty(global.window, "documentPictureInPicture", {
      value: { requestWindow: vi.fn(), window: null },
      writable: true,
      configurable: true,
    });
    expect(isDocumentPiPSupported()).toBe(true);
  });
});

describe("useDocumentPiP", () => {
  const originalWindow = global.window;

  afterEach(() => {
    // Restore window
    if (originalWindow.documentPictureInPicture) {
      delete (originalWindow as any).documentPictureInPicture;
    }
  });

  it("starts with PiP inactive", () => {
    const videoRef = { current: document.createElement("video") };
    const containerRef = { current: document.createElement("div") };
    const { result } = renderHook(() =>
      useDocumentPiP(videoRef, containerRef),
    );

    expect(result.current.isPiPActive).toBe(false);
  });

  it("isDocumentPiPSupported matches hook value", () => {
    const videoRef = { current: document.createElement("video") };
    const containerRef = { current: document.createElement("div") };
    const { result } = renderHook(() =>
      useDocumentPiP(videoRef, containerRef),
    );

    expect(result.current.isDocumentPiPSupported).toBe(
      isDocumentPiPSupported(),
    );
  });

  it("enterPiP does nothing when refs are null", async () => {
    const videoRef = { current: null };
    const containerRef = { current: null };
    const { result } = renderHook(() =>
      useDocumentPiP(videoRef, containerRef),
    );

    await act(async () => {
      await result.current.enterPiP();
    });

    expect(result.current.isPiPActive).toBe(false);
  });

  it("fallback to video PiP when document PiP is unavailable", async () => {
    const videoRef = { current: document.createElement("video") };
    const containerRef = { current: document.createElement("div") };
    const { result } = renderHook(() =>
      useDocumentPiP(videoRef, containerRef),
    );

    // Mock requestPictureInPicture
    const requestPiP = vi.fn().mockResolvedValue(undefined);
    videoRef.current!.requestPictureInPicture = requestPiP;

    await act(async () => {
      await result.current.enterPiP();
    });

    // Should have tried the fallback
    expect(requestPiP).toHaveBeenCalled();
  });

  it("exitPiP handles null ref gracefully", async () => {
    const videoRef = { current: null };
    const containerRef = { current: null };
    const { result } = renderHook(() =>
      useDocumentPiP(videoRef, containerRef),
    );

    await act(async () => {
      await result.current.exitPiP();
    });

    expect(result.current.isPiPActive).toBe(false);
  });

  it("enterPiP with null video ref does nothing", async () => {
    const videoRef = { current: null };
    const containerRef = { current: document.createElement("div") };
    const { result } = renderHook(() =>
      useDocumentPiP(videoRef, containerRef),
    );

    await act(async () => {
      await result.current.enterPiP();
    });

    expect(result.current.isPiPActive).toBe(false);
  });

  it("exitPiP with no active PiP does nothing", async () => {
    const videoRef = { current: document.createElement("video") };
    const containerRef = { current: document.createElement("div") };
    const { result } = renderHook(() =>
      useDocumentPiP(videoRef, containerRef),
    );

    await act(async () => {
      await result.current.exitPiP();
    });

    expect(result.current.isPiPActive).toBe(false);
  });
});
