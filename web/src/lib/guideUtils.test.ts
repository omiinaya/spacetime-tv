import { describe, it, expect } from "vitest";
import {
  parseXmltvTime,
  formatTime,
  programmeProgress,
  programmeTimeRange,
} from "./guideUtils";

describe("parseXmltvTime", () => {
  it("parses standard XMLTV timestamp with +0200 offset", () => {
    const d = parseXmltvTime("20260623043400 +0200");
    // 04:34 +0200 = 02:34 UTC — use UTC getters for timezone-independent tests
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // June is 5 (0-indexed)
    expect(d.getUTCDate()).toBe(23);
    expect(d.getUTCHours()).toBe(2);
    expect(d.getUTCMinutes()).toBe(34);
    expect(d.getUTCSeconds()).toBe(0);
  });

  it("parses timestamp with -0500 offset", () => {
    const d = parseXmltvTime("20260623080000 -0500");
    // 08:00 -0500 = 13:00 UTC
    expect(d.getUTCHours()).toBe(13);
  });

  it("parses timestamp with +0000 offset", () => {
    const d = parseXmltvTime("20260623120000 +0000");
    expect(d.getUTCHours()).toBe(12);
  });

  it("handles edge case: midnight", () => {
    const d = parseXmltvTime("20260701000000 +0200");
    // 00:00 +0200 = 22:00 UTC (previous day June 30)
    expect(d.getUTCHours()).toBe(22);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCDate()).toBe(30);
    expect(d.getUTCMonth()).toBe(5); // June
  });

  it("handles edge case: end of year", () => {
    const d = parseXmltvTime("20261231235900 +0200");
    // 23:59 +0200 = 21:59 UTC
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(11); // December
    expect(d.getUTCDate()).toBe(31);
    expect(d.getUTCHours()).toBe(21);
    expect(d.getUTCMinutes()).toBe(59);
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
    const now = parseXmltvTime("20260601000000 +0200"); // before start
    expect(programmeProgress(p, now)).toBe(0);
  });

  it("returns 1 for programme that has ended", () => {
    const p = makeProgramme("20260601000000 +0200", "20260601010000 +0200");
    const now = parseXmltvTime("20260601030000 +0200"); // after stop
    expect(programmeProgress(p, now)).toBe(1);
  });

  it("returns 0.5 at midpoint of programme", () => {
    const p = makeProgramme("20260601000000 +0200", "20260601020000 +0200");
    const now = parseXmltvTime("20260601010000 +0200"); // exactly midpoint
    expect(programmeProgress(p, now)).toBeCloseTo(0.5, 2);
  });

  it("returns 0.25 at quarter mark", () => {
    const p = makeProgramme("20260601000000 +0200", "20260601020000 +0200");
    const now = parseXmltvTime("20260601003000 +0200"); // quarter mark
    expect(programmeProgress(p, now)).toBeCloseTo(0.25, 2);
  });

  it("handles zero-duration programme gracefully", () => {
    const p = makeProgramme("20260601000000 +0200", "20260601000000 +0200");
    const now = parseXmltvTime("20260601000000 +0200");
    expect(programmeProgress(p, now)).toBe(0);
  });
});

describe("programmeTimeRange", () => {
  it("formats a range in local timezone", () => {
    const start = parseXmltvTime("20260623040000 +0200");
    const stop = parseXmltvTime("20260623060000 +0200");
    const expected = `${formatTime(start)} – ${formatTime(stop)}`;
    const p = { start: "20260623040000 +0200", stop: "20260623060000 +0200" };
    expect(programmeTimeRange(p)).toBe(expected);
  });

  it("handles same start/stop gracefully", () => {
    const d = parseXmltvTime("20260623120000 +0200");
    const expected = `${formatTime(d)} – ${formatTime(d)}`;
    const p = { start: "20260623120000 +0200", stop: "20260623120000 +0200" };
    expect(programmeTimeRange(p)).toBe(expected);
  });
});
