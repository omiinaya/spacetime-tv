/**
 * Tests for MediaInfoBar — shared metadata bar for Movie/Series overlays.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaInfoBar } from "@/components/media/MediaInfoBar";

describe("MediaInfoBar", () => {
  it("renders nothing when no props are provided", () => {
    const { container } = render(<MediaInfoBar />);
    expect(container.innerHTML).toBe("");
  });

  it("shows date and duration", () => {
    render(<MediaInfoBar date="2024-05-15" duration="2h 15m" />);
    expect(screen.getByText("2024-05-15")).toBeTruthy();
    expect(screen.getByText("2h 15m")).toBeTruthy();
  });

  it("shows status text", () => {
    render(<MediaInfoBar status="Returning Series" />);
    expect(screen.getByText("Returning Series")).toBeTruthy();
  });

  it("links to TMDB with default movie type", () => {
    render(<MediaInfoBar tmdbId={603} />);
    const link = screen.getByText("TMDB").closest("a")!;
    expect(link.getAttribute("href")).toBe(
      "https://www.themoviedb.org/movie/603",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("links to TMDB with tv type for series", () => {
    render(<MediaInfoBar tmdbId={1396} mediaType="tv" />);
    const link = screen.getByText("TMDB").closest("a")!;
    expect(link.getAttribute("href")).toBe(
      "https://www.themoviedb.org/tv/1396",
    );
  });

  it("links to homepage when provided", () => {
    render(<MediaInfoBar homepage="https://example.com" />);
    const link = screen.getByText("Homepage").closest("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com");
  });

  it("omits individual blocks when their props are missing", () => {
    render(<MediaInfoBar tmdbId={1} />);
    expect(screen.queryByText("Homepage")).toBeNull();
    expect(screen.queryByText("Returning Series")).toBeNull();
  });
});
