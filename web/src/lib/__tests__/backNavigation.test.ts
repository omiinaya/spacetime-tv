import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBackPath, saveBackPath } from "@/lib/backNavigation";

describe("backNavigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves a path to sessionStorage", () => {
    saveBackPath("/movies?page=2");
    expect(sessionStorage.getItem("stv_back_url")).toBe("/movies?page=2");
  });

  it("reads a saved path", () => {
    sessionStorage.setItem("stv_back_url", "/guide");
    expect(getBackPath()).toBe("/guide");
  });

  it("returns null when nothing saved", () => {
    expect(getBackPath()).toBeNull();
  });

  it("returns null when sessionStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(getBackPath()).toBeNull();
  });

  it("swallows storage errors on save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => saveBackPath("/home")).not.toThrow();
  });

  it("intercepts clicks on [data-watch-link] and records current path", () => {
    // Re-import to run the module-level click listener registration in jsdom.
    document.body.innerHTML = '<button data-watch-link="true">watch</button>';
    const btn = document.querySelector<HTMLElement>("[data-watch-link]")!;

    // Fake the current URL so the captured path is deterministic.
    const orig = window.history.pushState;
    window.history.pushState({}, "", "/live");

    btn.click();

    expect(sessionStorage.getItem("stv_back_url")).toBe("/live");
    window.history.pushState = orig;
  });

  it("does not record clicks outside [data-watch-link]", () => {
    document.body.innerHTML = '<button id="plain">plain</button>';
    document.querySelector<HTMLElement>("#plain")!.click();
    expect(sessionStorage.getItem("stv_back_url")).toBeNull();
  });
});
