/**
 * Tests for the SubtitleSelector component.
 *
 * SubtitleSelector probes /api/subtitles/probe/:type/:id on mount and
 * renders a dropdown with available subtitle tracks. Selecting a track
 * adds a <track> element to the video. "Off" removes all tracks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SubtitleSelector } from "@/components/SubtitleSelector";

describe("SubtitleSelector", () => {
  const videoRef = { current: document.createElement("video") };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    // Clear any existing track elements from the video mock
    Array.from(videoRef.current.querySelectorAll("track")).forEach((t) =>
      t.remove(),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sampleTracks = [
    { index: 0, language: "eng", title: "English", codec: "webvtt" },
    { index: 1, language: "spa", title: "Spanish", codec: "webvtt" },
  ];

  function mockFetchSuccess(data: unknown) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () => Promise.resolve(data),
    });
  }

  it("renders Subtitles button", () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );
    expect(screen.getByLabelText("Subtitles")).toBeInTheDocument();
  });

  it("opens dropdown on button click and shows 'Off' option", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));

    await waitFor(() => {
      expect(screen.getByText("Off")).toBeInTheDocument();
      expect(screen.getByText(/eng/)).toBeInTheDocument();
    });
  });

  it("fetches subtitles from correct probe URL", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/subtitles/probe/movie/123");
    });
  });

  it("selecting a track adds a <track> element to the video", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));
    await waitFor(() => {
      expect(screen.getByText(/eng/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/eng/));

    // A <track> element should have been added to the video
    const track = videoRef.current.querySelector("track");
    expect(track).not.toBeNull();
    expect(track?.getAttribute("src")).toBe("/api/subtitles/movie/123/0");
    expect(track?.getAttribute("kind")).toBe("subtitles");
  });

  it("selecting 'Off' removes existing tracks", async () => {
    // First add a track manually
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.src = "/api/subtitles/movie/123/0";
    videoRef.current.appendChild(track);

    mockFetchSuccess({ tracks: sampleTracks });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));
    await waitFor(() => {
      expect(screen.getByText("Off")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Off"));

    // Track should be removed
    expect(videoRef.current.querySelector("track")).toBeNull();
  });

  it("shows loading state while fetching", () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));
    expect(screen.getByText("Detecting…")).toBeInTheDocument();
  });

  it("shows error state when probe returns error", async () => {
    mockFetchSuccess({ error: "No subtitles" });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));
    await waitFor(() => {
      expect(screen.getByText("No subtitles")).toBeInTheDocument();
    });
  });

  it('shows "No subtitles available" when tracks === 0', async () => {
    mockFetchSuccess({ tracks: [] });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));
    await waitFor(() => {
      expect(screen.getByText("No subtitles available")).toBeInTheDocument();
    });
  });

  it("selecting a track adds a <track> element with correct attributes", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));
    await waitFor(() => {
      expect(screen.getByText(/eng/)).toBeInTheDocument();
    });

    // Before selection: no track element
    expect(videoRef.current.querySelector("track")).toBeNull();
    expect(videoRef.current.querySelectorAll("track").length).toBe(0);

    fireEvent.click(screen.getByText(/eng/));

    // A <track> element should have been added with correct attributes
    const track = videoRef.current.querySelector("track");
    expect(track).not.toBeNull();
    expect(track?.getAttribute("src")).toBe("/api/subtitles/movie/123/0");
    expect(track?.getAttribute("kind")).toBe("subtitles");
    expect(track?.getAttribute("default")).toBe("");
    expect(track?.getAttribute("srclang")).toBe("eng");
    expect(track?.getAttribute("label")).toBe("eng");
  });

  it("handles network error gracefully", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Failed to fetch"),
    );
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));
    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    });
  });

  it("renders with series type", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(
      <SubtitleSelector mediaType="series" streamId="42" videoRef={videoRef} />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/subtitles/probe/series/42");
    });
  });

  it("displays track language label with optional title", async () => {
    const tracksWithTitles = [
      { index: 0, language: "eng", title: "English (SDH)", codec: "webvtt" },
      { index: 1, language: "spa", title: "", codec: "webvtt" },
    ];
    mockFetchSuccess({ tracks: tracksWithTitles });
    render(
      <SubtitleSelector mediaType="movie" streamId="123" videoRef={videoRef} />,
    );

    fireEvent.click(screen.getByLabelText("Subtitles"));
    await waitFor(() => {
      expect(screen.getByText("eng — English (SDH)")).toBeInTheDocument();
      // Track with no title: just "spa"
      expect(screen.getByText("spa")).toBeInTheDocument();
    });
  });
});
