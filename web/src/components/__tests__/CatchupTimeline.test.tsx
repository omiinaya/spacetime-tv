import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCatchup = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    guide: {
      catchup: (...args: unknown[]) =>
        (mockCatchup as unknown as (...a: unknown[]) => Promise<unknown>)(
          ...args,
        ),
    },
  },
}));

import { CatchupTimeline } from "@/components/CatchupTimeline";

const baseProps = {
  streamId: 123,
  onSelectProgramme: vi.fn(),
  onGoLive: vi.fn(),
  isTimeshiftMode: true,
};

const sampleProgrammes = [
  {
    title: "Morning News",
    subtitle: "Bulletin",
    start_offset: 0,
    duration: 1800,
  },
  { title: "Sports Live", subtitle: "", start_offset: 1800, duration: 3600 },
  { title: "Evening Film", subtitle: "", start_offset: 5400, duration: 7200 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CatchupTimeline", () => {
  it("shows loading state while fetching", () => {
    mockCatchup.mockReturnValue(new Promise(() => {}));
    render(<CatchupTimeline {...baseProps} />);
    expect(screen.getByText(/Loading EPG/)).toBeInTheDocument();
  });

  it("renders programmes after fetch and calls onGoLive", async () => {
    mockCatchup.mockResolvedValue({ programmes: sampleProgrammes });
    const onGoLive = vi.fn();
    render(<CatchupTimeline {...baseProps} onGoLive={onGoLive} />);

    await waitFor(() =>
      expect(screen.getByText("Catch-up")).toBeInTheDocument(),
    );
    expect(mockCatchup).toHaveBeenCalledWith(123, 4);

    // Live button present; timeshift mode means it's enabled.
    const liveBtn = screen.getByRole("button", { name: /Live/ });
    expect(liveBtn).not.toBeDisabled();
    fireEvent.click(liveBtn);
    expect(onGoLive).toHaveBeenCalled();
  });

  it("disables the Live button when not in timeshift mode", async () => {
    mockCatchup.mockResolvedValue({ programmes: sampleProgrammes });
    render(<CatchupTimeline {...baseProps} isTimeshiftMode={false} />);
    await waitFor(() =>
      expect(screen.getByText("Catch-up")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Live/ })).toBeDisabled();
  });

  it("shows error state on fetch failure", async () => {
    mockCatchup.mockRejectedValue(new Error("EPG service down"));
    render(<CatchupTimeline {...baseProps} />);
    expect(await screen.findByText("EPG service down")).toBeInTheDocument();
  });

  it("renders nothing when there are no programmes", async () => {
    mockCatchup.mockResolvedValue({ programmes: [] });
    const { container } = render(<CatchupTimeline {...baseProps} />);
    // Wait for the loaded/empty re-render (component returns null) rather
    // than just the fetch call — robust under parallel-worker contention.
    await waitFor(() => expect(mockCatchup).toHaveBeenCalled());
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("clicking the timeline reports the offset from now", async () => {
    mockCatchup.mockResolvedValue({ programmes: sampleProgrammes });
    const onSelectProgramme = vi.fn();
    render(
      <CatchupTimeline {...baseProps} onSelectProgramme={onSelectProgramme} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Catch-up")).toBeInTheDocument(),
    );

    // The programme label spans live inside the clickable bar (div.cursor-pointer).
    const label = screen.getByText("Morning News");
    const bar = label.closest("div.cursor-pointer") as HTMLElement;
    expect(bar).toBeInTheDocument();
    // JSDOM reports width 0 for getBoundingClientRect → mock a real width so
    // the offset math is deterministic: click at x=25 of width 100 → x=0.25.
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
      width: 100,
      height: 20,
      toJSON: () => ({}),
    });
    fireEvent.click(bar, { clientX: 25, clientY: 10 });
    // totalWindow = 0 + 1800 = 1800s; click x=0.25 → offset = 1800*(1-0.25) = 1350.
    await waitFor(() => expect(onSelectProgramme).toHaveBeenCalled());
    expect(onSelectProgramme.mock.calls[0][0]).toBe(1350);
  });

  it("shows a tooltip when hovering a programme", async () => {
    mockCatchup.mockResolvedValue({ programmes: sampleProgrammes });
    render(<CatchupTimeline {...baseProps} />);
    await waitFor(() =>
      expect(screen.getByText("Catch-up")).toBeInTheDocument(),
    );

    const titleEl = screen.getByText("Morning News");
    fireEvent.mouseEnter(titleEl.closest("div")!);
    expect(await screen.findByText(/min ago/)).toBeInTheDocument();
  });
});
