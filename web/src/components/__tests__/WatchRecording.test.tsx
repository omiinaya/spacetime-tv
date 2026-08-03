import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: "rec-abc" }),
  };
});

vi.mock("@/hooks/useFullscreen", () => ({
  useFullscreen: () => ({ isFullscreen: false, setIsFullscreen: vi.fn() }),
}));

import WatchRecording from "@/components/WatchRecording";

function renderPage() {
  return render(
    <MemoryRouter>
      <WatchRecording />
    </MemoryRouter>,
  );
}

// jsdom doesn't implement HTMLMediaElement methods; stub play/pause.
function stubVideoPlayPause() {
  const proto = HTMLMediaElement.prototype as unknown as Record<
    string,
    unknown
  >;
  proto.play = vi.fn().mockResolvedValue(undefined);
  proto.pause = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  stubVideoPlayPause();
});

describe("WatchRecording", () => {
  it("renders the video with the recording source", () => {
    renderPage();
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toContain(
      "/api/stream/recordings/rec-abc",
    );
  });

  it("navigates back when the back button is clicked", () => {
    renderPage();
    // Back button is the arrow-left icon button in the top-left.
    const backBtn = document
      .querySelector("div.relative button svg.lucide-arrow-left")!
      .closest("button") as HTMLButtonElement;
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("shows play state after the video emits a play event", async () => {
    renderPage();
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent(video, new Event("play"));
    // Play/pause button now shows the Pause icon.
    await waitFor(() => {
      expect(document.querySelector("svg.lucide-pause")).toBeInTheDocument();
    });
  });

  it("shows formatted time / duration once duration is known", async () => {
    renderPage();
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", {
      value: 90,
      configurable: true,
    });
    Object.defineProperty(video, "duration", {
      value: 300,
      configurable: true,
    });
    fireEvent(video, new Event("timeupdate"));
    fireEvent(video, new Event("durationchange"));
    // fmtTime(90) = "1:30", fmtTime(300) = "5:00"; rendered as "1:30 / 5:00".
    const timeSpan = screen.getByText((content) => content.includes("1:30"));
    expect(timeSpan.textContent).toContain("5:00");
  });

  it("clicking the container toggles play", () => {
    renderPage();
    const container = document.querySelector("div.relative") as HTMLElement;
    // jsdom keeps `paused` true even after play(); drive it manually so the
    // toggle logic (v.paused ? play : pause) is exercised both ways.
    let paused = true;
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "paused", {
      get: () => paused,
      configurable: true,
    });
    const playMock = HTMLMediaElement.prototype.play as ReturnType<
      typeof vi.fn
    >;
    const pauseMock = HTMLMediaElement.prototype.pause as ReturnType<
      typeof vi.fn
    >;
    playMock.mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    pauseMock.mockImplementation(() => {
      paused = true;
    });

    fireEvent.click(container);
    expect(playMock).toHaveBeenCalled();
    // After play, the next container click pauses.
    fireEvent.click(container);
    expect(pauseMock).toHaveBeenCalled();
  });

  it("seeking on the progress bar sets currentTime proportionally", () => {
    renderPage();
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      value: 200,
      configurable: true,
    });
    fireEvent(video, new Event("durationchange"));

    // The progress bar is the clickable div with the white/20 track.
    const bar = document.querySelector(
      "div.w-full.h-1.bg-white\\/20",
    ) as HTMLElement;
    expect(bar).not.toBeNull();
    // Click at 50% of the bar.
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 4,
      width: 200,
      height: 4,
      toJSON: () => ({}),
    });
    fireEvent.click(bar, { clientX: 100, clientY: 2 });
    expect(video.currentTime).toBe(100);
  });
});
