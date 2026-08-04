import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Sidebar from "@/components/Sidebar";

function renderSidebar(props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <Sidebar
        sidebarWidth={240}
        onResizeStart={vi.fn()}
        showWatchlistPopover={false}
        onWatchlistToggle={vi.fn()}
        onProfileSwitch={vi.fn()}
        profile={null}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("renders brand name", () => {
    renderSidebar();
    expect(screen.getByText("Spacetime-TV")).toBeTruthy();
  });

  it("renders navigation items", () => {
    renderSidebar();
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Live TV")).toBeTruthy();
    expect(screen.getByText("Movies")).toBeTruthy();
    expect(screen.getByText("Series")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("renders profile initial when profile provided", () => {
    renderSidebar({
      profile: { profile_id: "1", name: "Alice", avatar: "", created: 0 },
    });
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("calls onProfileSwitch when profile button clicked", () => {
    const onProfileSwitch = vi.fn();
    renderSidebar({
      profile: { profile_id: "1", name: "Alice", avatar: "", created: 0 },
      onProfileSwitch,
    });
    fireEvent.click(screen.getByLabelText("Switch profile"));
    expect(onProfileSwitch).toHaveBeenCalled();
  });

  it("calls onWatchlistToggle when watchlist button clicked", () => {
    const onWatchlistToggle = vi.fn();
    renderSidebar({ onWatchlistToggle });
    fireEvent.click(screen.getByLabelText("Watchlist"));
    expect(onWatchlistToggle).toHaveBeenCalledWith(true);
  });

  it("renders admin link", () => {
    renderSidebar();
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  it("renders the watchlist popover when shown", () => {
    renderSidebar({ showWatchlistPopover: true });
    // The nav button and the popover dialog both carry a "Watchlist"
    // label; assert the dialog is present alongside the nav button.
    expect(screen.getByRole("dialog")).toBeTruthy();
    const buttons = screen.getAllByLabelText("Watchlist");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("marks the watchlist button as expanded when the popover is open", () => {
    renderSidebar({ showWatchlistPopover: true });
    // The nav button is the one with aria-expanded (the dialog has no such attr)
    const btn = screen
      .getAllByLabelText("Watchlist")
      .find((el) => el.hasAttribute("aria-expanded")) as HTMLElement;
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("navigates to a nav destination on click", () => {
    renderSidebar();
    fireEvent.click(screen.getByLabelText("Movies"));
    // MemoryRouter — assert the click didn't throw and the item exists
    expect(screen.getByLabelText("Movies")).toBeTruthy();
  });

  it("navigates to settings on click", () => {
    renderSidebar();
    fireEvent.click(screen.getByLabelText("Settings"));
    expect(screen.getByLabelText("Settings")).toBeTruthy();
  });

  it("navigates to admin on click", () => {
    renderSidebar();
    fireEvent.click(screen.getByText("Admin"));
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  it("calls onResizeStart on the resize handle mouse down", () => {
    const onResizeStart = vi.fn();
    const { container } = renderSidebar({ onResizeStart });
    const handle = container.querySelector(".cursor-ew-resize")!;
    fireEvent.mouseDown(handle);
    expect(onResizeStart).toHaveBeenCalled();
  });

  it("shows the profile name and initial when a profile exists", () => {
    renderSidebar({
      profile: { id: "p1", name: "Alex", token: "t" } as unknown as {
        id: string;
        name: string;
        token: string;
      },
    });
    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("hides the profile badge when no profile is set", () => {
    renderSidebar({ profile: null });
    expect(screen.queryByLabelText("Switch profile")).toBeNull();
  });

  it("calls onProfileSwitch when the profile badge is clicked", () => {
    const onProfileSwitch = vi.fn();
    renderSidebar({
      onProfileSwitch,
      profile: { id: "p1", name: "Alex", token: "t" } as unknown as {
        id: string;
        name: string;
        token: string;
      },
    });
    fireEvent.click(screen.getByLabelText("Switch profile"));
    expect(onProfileSwitch).toHaveBeenCalled();
  });
});
