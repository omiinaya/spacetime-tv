/**
 * Tests for the RecordingsPage component.
 *
 * Covers loading state, empty state, recording list rendering, active
 * (in-progress) recording indicators, size/duration formatting, play
 * navigation, delete flow, manual refresh, and the 3s polling loop that
 * runs while any recording is active.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import RecordingsPage from "@/pages/RecordingsPage";

// ── Mock useRecordings hook (fetch logic tested separately in useRecording.test.ts) ──
const mockRecordings = vi.fn();
const mockDeleteRecording = vi.fn();
const mockRefresh = vi.fn();
const mockLoading = vi.fn();

vi.mock("@/hooks/useRecording", () => ({
  useRecordings: () => ({
    recordings: mockRecordings(),
    loading: mockLoading(),
    deleteRecording: mockDeleteRecording,
    refresh: mockRefresh,
  }),
  useRecording: () => ({
    activeRecordingId: null,
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));

// ── Mock navigate ─────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Sample data ───────────────────────────────────────────
const completedRecording = {
  id: "rec-completed",
  stream_id: 1,
  name: "News at Six",
  started_at: "2026-07-30T18:00:00Z",
  stopped_at: "2026-07-30T18:30:00Z",
  status: "completed",
  file: "/tmp/rec-completed.mp4",
  size_bytes: 5 * 1024 * 1024, // 5 MB
};

const activeRecording = {
  id: "rec-active",
  stream_id: 2,
  name: "Live Sports",
  started_at: "2026-07-30T19:00:00Z",
  status: "recording",
  file: "/tmp/rec-active.mp4",
  size_bytes: 10 * 1024 * 1024, // 10 MB — live growth
};

const failedRecording = {
  id: "rec-failed",
  stream_id: 3,
  name: "Crashed Show",
  started_at: "2026-07-30T17:00:00Z",
  stopped_at: "2026-07-30T17:00:05Z",
  status: "failed",
  file: "/tmp/rec-failed.mp4",
  size_bytes: 0,
};

// ── Helper ─────────────────────────────────────────────────
function renderPage() {
  return render(
    <MemoryRouter>
      <RecordingsPage />
    </MemoryRouter>,
  );
}

describe("RecordingsPage", () => {
  beforeEach(() => {
    mockRecordings.mockReset();
    mockDeleteRecording.mockReset();
    mockRefresh.mockReset();
    mockLoading.mockReset();
    mockLoading.mockReturnValue(false);
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows a loading spinner while fetching", () => {
    mockLoading.mockReturnValue(true);
    mockRecordings.mockReturnValue([]);
    const { container } = renderPage();
    // Loader2 icon renders with the animate-spin utility while loading
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows the empty state when there are no recordings", () => {
    mockRecordings.mockReturnValue([]);
    renderPage();
    expect(screen.getByText("No recordings yet")).toBeInTheDocument();
    expect(screen.getByText("0 recordings")).toBeInTheDocument();
  });

  it("renders a recording with name and formatted metadata", () => {
    mockRecordings.mockReturnValue([completedRecording]);
    renderPage();
    expect(screen.getByText("News at Six")).toBeInTheDocument();
    expect(screen.getByText("1 recording")).toBeInTheDocument();
    // 5 MB
    expect(screen.getByText("5.0 MB")).toBeInTheDocument();
  });

  it("formats large sizes in GB", () => {
    mockRecordings.mockReturnValue([
      { ...completedRecording, size_bytes: 3 * 1024 * 1024 * 1024 },
    ]);
    renderPage();
    expect(screen.getByText("3.0 GB")).toBeInTheDocument();
  });

  it("marks an active recording with the Recording… indicator", () => {
    mockRecordings.mockReturnValue([activeRecording]);
    renderPage();
    expect(screen.getByText("Recording…")).toBeInTheDocument();
    // Active recordings are not playable yet
    expect(
      screen.queryByRole("button", { name: /play live sports/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show size for a failed 0-byte recording", () => {
    mockRecordings.mockReturnValue([failedRecording]);
    renderPage();
    expect(screen.getByText("Crashed Show")).toBeInTheDocument();
    // 0 B is only rendered when size_bytes > 0
    expect(screen.queryByText("0 B")).not.toBeInTheDocument();
  });

  it("navigates to the player when Play is clicked", () => {
    mockRecordings.mockReturnValue([completedRecording]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /play news at six/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/watch/recording/rec-completed");
  });

  it("deletes a recording after confirmation", async () => {
    mockDeleteRecording.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockRecordings.mockReturnValue([completedRecording, activeRecording]);

    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: /delete news at six/i }),
    );

    await waitFor(() => {
      expect(mockDeleteRecording).toHaveBeenCalledWith("rec-completed");
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  it("does not delete when the user cancels the confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockRecordings.mockReturnValue([completedRecording]);

    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: /delete news at six/i }),
    );

    expect(mockDeleteRecording).not.toHaveBeenCalled();
  });

  it("refreshes when the Refresh button is clicked", () => {
    mockRecordings.mockReturnValue([completedRecording]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("polls refresh every 3s while a recording is active", () => {
    vi.useFakeTimers();
    mockRecordings.mockReturnValue([activeRecording]);
    renderPage();

    const callsBefore = mockRefresh.mock.calls.length;
    vi.advanceTimersByTime(3000);
    expect(mockRefresh.mock.calls.length).toBe(callsBefore + 1);

    vi.advanceTimersByTime(3000);
    expect(mockRefresh.mock.calls.length).toBe(callsBefore + 2);
  });

  it("does not poll when no recording is active", () => {
    vi.useFakeTimers();
    mockRecordings.mockReturnValue([completedRecording]);
    renderPage();

    vi.advanceTimersByTime(9000);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
