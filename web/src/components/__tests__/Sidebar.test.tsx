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
});
