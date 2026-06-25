import { describe, it, expect } from "vitest";
import { parseXmltvTime, formatTime, programmeProgress, programmeTimeRange } from "./guideUtils";

describe("parseXmltvTime", () => {
  it("parses standard XMLTV timestamp with +0200 offset", () => {
    const d = parseXmltvTime("20260623043400 +0200");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June is 5 (0-indexed)
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(4);
    expect(d.getMinutes()).toBe(34);
    expect(d.getSeconds()).toBe(0);
  });

  it("parses timestamp with -0500 offset", () => {
    const d = parseXmltvTime("20260623080000 -0500");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getUTCHours()).toBe(13); // 08:00 -0500 = 13:00 UTC
  });

  it("parses timestamp with +0000 offset", () => {
    const d = parseXmltvTime("20260623120000 +0000");
    expect(d.getUTCHours()).toBe(12);
  });

  it("handles edge case: midnight", () => {
    const d = parseXmltvTime("20260701000000 +0200");
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("handles edge case: end of year", () => {
    const d = parseXmltvTime("20261231235900 +0200");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(11); // December
    expect(d.getDate()).toBe(31);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});

describe("formatTime", () => {
  it("formats noon as 12:00 PM", () => {
    const d = new Date(2026, 5, 23, 12, 0, 0);
    expect(formatTime(d)).toBe("12:00 PM");
  });

  it("formats midnight as 12:00 AM", () => {
    const d = new Date(2026, 5, 23, 0, 0, 0);
    expect(formatTime(d)).toBe("12:00 AM");
  });

  it("formats afternoon time", () => {
    const d = new Date(2026, 5, 23, 15, 30, 0);
    expect(formatTime(d)).toBe("3:30 PM");
  });

  it("formats morning time", () => {
    const d = new Date(2026, 5, 23, 9, 5, 0);
    expect(formatTime(d)).toBe("9:05 AM");
  });
});

describe("programmeProgress", () => {
  const makeProgramme = (startStr: string, stopStr: string, isLive = true) => ({
    start: startStr,
    stop: stopStr,
    is_live: isLive,
  });

  it("returns 0 for programme not yet started", () => {
    const p = makeProgramme("20270601000000 +0200", "20270601010000 +0200");
    const now = new Date("2026-06-01T00:00:00+02:00"); // before start
    expect(programmeProgress(p, now)).toBe(0);
  });

  it("returns 1 for programme that has ended", () => {
    const p = makeProgramme("20260601000000 +0200", "20260601010000 +0200");
    const now = new Date("2026-06-01T03:00:00+02:00"); // after stop
    expect(programmeProgress(p, now)).toBe(1);
  });

  it("returns 0.5 at midpoint of programme", () => {
    const p = makeProgramme("20260601000000 +0200", "20260601020000 +0200");
    const now = new Date("2026-06-01T01:00:00+02:00"); // exactly midpoint
    expect(programmeProgress(p, now)).toBeCloseTo(0.5, 2);
  });

  it("returns 0.25 at quarter mark", () => {
    const p = makeProgramme("20260601000000 +0200", "20260601020000 +0200");
    const now = new Date("2026-06-01T00:30:00+02:00"); // quarter mark
    expect(programmeProgress(p, now)).toBeCloseTo(0.25, 2);
  });

  it("handles zero-duration programme gracefully", () => {
    const p = makeProgramme("20260601000000 +0200", "20260601000000 +0200");
    const now = new Date("2026-06-01T00:00:00+02:00");
    expect(programmeProgress(p, now)).toBe(0);
  });
});

describe("programmeTimeRange", () => {
  it("formats a range", () => {
    const p = { start: "20260623040000 +0200", stop: "20260623060000 +0200" };
    const range = programmeTimeRange(p);
    expect(range).toContain("4:00");
    expect(range).toContain("6:00");
    expect(range).toContain("–"); // en-dash
  });

  it("handles same start/stop gracefully", () => {
    const p = { start: "20260623120000 +0200", stop: "20260623120000 +0200" };
    const range = programmeTimeRange(p);
    expect(range).toContain("12:00");
  });
});
