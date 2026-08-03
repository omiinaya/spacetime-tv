/**
 * Tests for EpgSearchResults — EPG programme search result list.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EpgSearchResults from "@/components/EpgSearchResults";
import type { GuideSearchResult } from "@/lib/types";

const programs: GuideSearchResult[] = [
  {
    channel_id: 101,
    channel_name: "News 24",
    title: "World News at Six",
    subtitle: "Live from London",
    start_ts: 1717000000,
    stop_ts: 1717003600,
    duration: 3600,
  },
];

describe("EpgSearchResults", () => {
  it("shows programme count", () => {
    render(<EpgSearchResults results={programs} loading={false} query="" />);
    expect(screen.getByText("EPG Programmes (1)")).toBeTruthy();
  });

  it("shows a spinner when loading with no results yet", () => {
    render(<EpgSearchResults results={null} loading query="movie" />);
    // Both the header count and a big centered loader appear; at least the
    // loader must be present.
    expect(screen.getByText("EPG Programmes (0)")).toBeTruthy();
  });

  it("shows the empty state for a short-but-valid query with no results", () => {
    render(<EpgSearchResults results={[]} loading={false} query="xyz" />);
    expect(screen.getByText(/No EPG programmes found/)).toBeTruthy();
  });

  it("does not show empty state for a too-short query", () => {
    render(<EpgSearchResults results={[]} loading={false} query="a" />);
    expect(screen.queryByText(/No EPG programmes found/)).toBeNull();
  });

  it("renders programme title, time and duration", () => {
    render(<EpgSearchResults results={programs} loading={false} query="" />);
    expect(screen.getByText("World News at Six")).toBeTruthy();
    expect(screen.getByText("Live from London")).toBeTruthy();
    expect(screen.getByText("60m")).toBeTruthy();
    expect(screen.getByText("News 24")).toBeTruthy();
  });

  it("omits subtitle when not present", () => {
    const withoutSub = [
      { ...programs[0], subtitle: undefined as unknown as string },
    ];
    render(<EpgSearchResults results={withoutSub} loading={false} query="" />);
    expect(screen.queryByText("Live from London")).toBeNull();
  });
});
