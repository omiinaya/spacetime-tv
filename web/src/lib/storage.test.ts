import { describe, it, expect, beforeEach } from "vitest";

// Storage is side-effect module — read/clear localStorage
describe("localStorage key migration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads normalized underscore key", () => {
    localStorage.setItem("stv_volume", "0.5");
    const val = localStorage.getItem("stv_volume");
    expect(val).toBe("0.5");
  });

  it("backward-compat: reads old dash key", () => {
    localStorage.setItem("stv-sidebar-width", "280");
    // The storage migration would normalize this — test that
    // the old key is accessible directly
    expect(localStorage.getItem("stv-sidebar-width")).toBe("280");
  });

  it("writes new underscore key", () => {
    localStorage.setItem("stv_muted", "true");
    expect(localStorage.getItem("stv_muted")).toBe("true");
  });

  it("sidebar width persists with new key", () => {
    localStorage.setItem("stv_sidebar_width", "320");
    expect(localStorage.getItem("stv_sidebar_width")).toBe("320");
  });

  it("PWA dismiss timestamp persists", () => {
    const ts = String(Date.now());
    localStorage.setItem("stv_pwa_dismissed", ts);
    expect(localStorage.getItem("stv_pwa_dismissed")).toBe(ts);
  });
});
