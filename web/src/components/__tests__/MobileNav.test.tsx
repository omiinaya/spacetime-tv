import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

import { MobileNav, MobileHeader } from "@/components/MobileNav";

describe("MobileNav", () => {
  beforeEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <MobileNav
        open={false}
        onClose={() => {}}
        onNavigate={() => {}}
        isActive={() => false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders all nav items with aria labels when open", () => {
    render(
      <MobileNav
        open={true}
        onClose={() => {}}
        onNavigate={() => {}}
        isActive={() => false}
      />,
    );
    for (const label of [
      "Home",
      "Live TV",
      "TV Guide",
      "Movies",
      "Series",
      "Watchlist",
      "History",
      "Recordings",
      "Search",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("marks the active route with aria-current=page", () => {
    render(
      <MobileNav
        open={true}
        onClose={() => {}}
        onNavigate={() => {}}
        isActive={(p) => p === "/movies"}
      />,
    );
    const movies = screen.getByRole("button", { name: "Movies" });
    expect(movies.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getByRole("button", { name: "Home" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("navigates and closes on a nav item click", () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileNav
        open={true}
        onClose={onClose}
        onNavigate={onNavigate}
        isActive={() => false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    expect(onNavigate).toHaveBeenCalledWith("/series");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <MobileNav
        open
        onClose={onClose}
        onNavigate={() => {}}
        isActive={() => false}
      />,
    );
    // The backdrop is the absolute inset-0 div behind the drawer.
    const backdrop = document.querySelector(
      "div.absolute.inset-0",
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it on close", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <MobileNav
        open={false}
        onClose={onClose}
        onNavigate={() => {}}
        isActive={() => false}
      />,
    );
    rerender(
      <MobileNav
        open
        onClose={onClose}
        onNavigate={() => {}}
        isActive={() => false}
      />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <MobileNav
        open={false}
        onClose={onClose}
        onNavigate={() => {}}
        isActive={() => false}
      />,
    );
    expect(document.body.style.overflow).toBe("");
  });
});

describe("MobileHeader", () => {
  it("opens the nav on hamburger click", () => {
    const onOpen = vi.fn();
    render(<MobileHeader onOpen={onOpen} onNavigate={() => {}} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    expect(onOpen).toHaveBeenCalled();
  });

  it("navigates home on brand click", () => {
    const onNavigate = vi.fn();
    render(<MobileHeader onOpen={() => {}} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Spacetime-TV"));
    expect(onNavigate).toHaveBeenCalledWith("/");
  });
});
