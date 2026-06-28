/**
 * Tests for the SleepTimer component.
 *
 * SleepTimer shows a dropdown with preset durations (30m, 60m, 90m, Off).
 * When a duration is selected, it counts down and calls onPause when it
 * reaches zero.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SleepTimer } from "@/components/SleepTimer";

describe("SleepTimer", () => {
  const onPause = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders Moon button with Sleep timer label", () => {
    render(<SleepTimer onPause={onPause} />);
    expect(screen.getByLabelText("Sleep timer")).toBeInTheDocument();
  });

  it("shows presets dropdown when clicked", () => {
    render(<SleepTimer onPause={onPause} />);
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    expect(screen.getByText("30m")).toBeInTheDocument();
    expect(screen.getByText("60m")).toBeInTheDocument();
    expect(screen.getByText("90m")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("starts 30-minute countdown when 30m is selected", () => {
    render(<SleepTimer onPause={onPause} />);
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("30m"));

    // Should show remaining time on the button
    const btn = screen.getByLabelText(/Sleep timer/);
    expect(btn.textContent).toContain("30:00");
  });

  it("counts down every second", () => {
    render(<SleepTimer onPause={onPause} />);
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("30m"));

    expect(screen.getByText("30:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("29:59")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("29:58")).toBeInTheDocument();
  });

  it("calls onPause and resets when timer reaches zero", () => {
    render(<SleepTimer onPause={onPause} />);
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("30m"));

    // Advance 30 minutes (30 * 60 = 1800 seconds)
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(onPause).toHaveBeenCalledTimes(1);
    // Timer should be reset (no remaining time)
    const btn = screen.getByLabelText("Sleep timer");
    expect(btn.textContent?.trim()).not.toContain(":");
  });

  it("stops countdown when Off is selected", () => {
    render(<SleepTimer onPause={onPause} />);
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("30m"));

    expect(screen.getByText("30:00")).toBeInTheDocument();

    // Select Off
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("Off"));

    // After advancing time, timer should stay at 0
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onPause).not.toHaveBeenCalled();
    const btn = screen.getByLabelText("Sleep timer");
    expect(btn.textContent?.trim()).not.toContain(":");
  });

  it("closes dropdown after selecting a preset", () => {
    render(<SleepTimer onPause={onPause} />);
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    expect(screen.getByText("30m")).toBeInTheDocument();

    fireEvent.click(screen.getByText("30m"));
    expect(screen.queryByText("30m")).not.toBeInTheDocument();
  });

  it("shows remaining countdown on the button after starting timer", () => {
    render(<SleepTimer onPause={onPause} />);

    // No timer should show initially
    let btn = screen.getByLabelText("Sleep timer");
    expect(btn.textContent?.trim()).toBe("");

    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("30m"));

    btn = screen.getByLabelText(/Sleep timer: 30:00 remaining/);
    expect(btn).toBeInTheDocument();
    const spans = btn.querySelectorAll("span");
    const found = Array.from(spans).some(
      (s) => s.textContent === "30:00",
    );
    expect(found).toBe(true);
  });

  it("switches from one timer to another when selected again", () => {
    render(<SleepTimer onPause={onPause} />);

    // Start 30 min
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("30m"));
    expect(screen.getByText("30:00")).toBeInTheDocument();

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("29:55")).toBeInTheDocument();

    // Switch to 90 min
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("90m"));
    expect(screen.getByText("90:00")).toBeInTheDocument();
  });

  it("cleans up interval on unmount", () => {
    const { unmount } = render(<SleepTimer onPause={onPause} />);
    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("30m"));

    unmount();

    // After unmounting, advancing time should not call onPause
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });
    expect(onPause).not.toHaveBeenCalled();
  });

  it("highlights the active preset in the dropdown", () => {
    render(<SleepTimer onPause={onPause} />);

    // Open dropdown
    fireEvent.click(screen.getByLabelText("Sleep timer"));

    // Off should be highlighted (text-blue-400) since no timer is running
    const offBtn = screen.getByText("Off");
    expect(offBtn.className).toContain("text-blue-400");
  });

  it("highlights the selected preset after starting", () => {
    render(<SleepTimer onPause={onPause} />);

    fireEvent.click(screen.getByLabelText("Sleep timer"));
    fireEvent.click(screen.getByText("30m"));

    // Re-open dropdown
    fireEvent.click(screen.getByLabelText("Sleep timer"));

    // 30m should be highlighted with purple
    const btn30 = screen.getByText("30m");
    expect(btn30.className).toContain("text-purple-400");
  });
});
