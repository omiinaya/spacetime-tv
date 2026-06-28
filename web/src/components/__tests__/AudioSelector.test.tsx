/**
 * Tests for the AudioSelector component.
 *
 * AudioSelector probes /api/audio/probe/:type/:id on mount and renders
 * a dropdown with available audio tracks. Hides when only 1 track.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AudioSelector } from "@/components/AudioSelector";

describe("AudioSelector", () => {
  const onSwitchTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const probeUrl = "/api/audio/probe/movie/123";

  const sampleTracks = [
    { index: 0, language: "eng", title: "English", codec: "aac", channels: 2 },
    { index: 1, language: "spa", title: "Spanish", codec: "aac", channels: 2 },
  ];

  function mockFetchSuccess(data: unknown) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () => Promise.resolve(data),
    });
  }

  it("renders Volume2 button", () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(<AudioSelector mediaType="movie" streamId="123" />);
    expect(screen.getByLabelText("Audio track")).toBeInTheDocument();
  });

  it("opens dropdown on button click", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(<AudioSelector mediaType="movie" streamId="123" />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(probeUrl);
    });

    fireEvent.click(screen.getByLabelText("Audio track"));
    // Both tracks should appear in dropdown
    expect(screen.getByText(/ENG/)).toBeInTheDocument();
    expect(screen.getByText(/SPA/)).toBeInTheDocument();
  });

  it("renders track labels with language, codec, and channels", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(<AudioSelector mediaType="movie" streamId="123" />);

    fireEvent.click(screen.getByLabelText("Audio track"));

    await waitFor(() => {
      expect(screen.getByText(/ENG/)).toBeInTheDocument();
    });

    // First track: "ENG — English — AAC — 2ch"
    const firstLabel = screen.getByText(/ENG — English — AAC — 2ch/);
    expect(firstLabel).toBeInTheDocument();
  });

  it("calls onSwitchTrack and closes dropdown on track click", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(
      <AudioSelector
        mediaType="movie"
        streamId="123"
        onSwitchTrack={onSwitchTrack}
      />,
    );

    fireEvent.click(screen.getByLabelText("Audio track"));

    await waitFor(() => {
      expect(screen.getByText(/ENG/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/ENG/));

    expect(onSwitchTrack).toHaveBeenCalledWith(0);
    // Dropdown should close — ENG text should be gone
    expect(screen.queryByText(/SPA/)).not.toBeInTheDocument();
  });

  it("hides when only 1 or fewer tracks", async () => {
    mockFetchSuccess({ tracks: [sampleTracks[0]] });
    // Use act to let the effect settle
    await act(async () => {
      render(<AudioSelector mediaType="movie" streamId="123" />);
    });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(probeUrl);
    });
    // Button should not be visible when hidden
    expect(screen.queryByLabelText("Audio track")).not.toBeInTheDocument();
  });

  it("shows loading state while fetching", async () => {
    // Never resolve the fetch
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<AudioSelector mediaType="movie" streamId="123" />);

    fireEvent.click(screen.getByLabelText("Audio track"));
    expect(screen.getByText("Detecting…")).toBeInTheDocument();
  });

  it("shows error state when probe returns error", async () => {
    mockFetchSuccess({ error: "No audio streams found" });
    render(<AudioSelector mediaType="movie" streamId="123" />);

    fireEvent.click(screen.getByLabelText("Audio track"));
    await waitFor(() => {
      expect(screen.getByText("No audio streams found")).toBeInTheDocument();
    });
  });

  it('shows "Single audio track" when tracks === 0', async () => {
    mockFetchSuccess({ tracks: [] });
    render(<AudioSelector mediaType="movie" streamId="123" />);

    fireEvent.click(screen.getByLabelText("Audio track"));
    await waitFor(() => {
      expect(screen.getByText("Single audio track")).toBeInTheDocument();
    });
  });

  it("closes dropdown when button is clicked again", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(<AudioSelector mediaType="movie" streamId="123" />);

    const btn = screen.getByLabelText("Audio track");
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/ENG/)).toBeInTheDocument();
    });

    fireEvent.click(btn);
    expect(screen.queryByText(/ENG/)).not.toBeInTheDocument();
  });

  it("renders with series type and fetches correct URL", async () => {
    mockFetchSuccess({ tracks: sampleTracks });
    render(<AudioSelector mediaType="series" streamId="42" />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/audio/probe/series/42");
    });
  });

  it("handles network error gracefully", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network failure"),
    );
    render(<AudioSelector mediaType="movie" streamId="123" />);

    fireEvent.click(screen.getByLabelText("Audio track"));
    await waitFor(() => {
      expect(screen.getByText("Network failure")).toBeInTheDocument();
    });
  });
});
