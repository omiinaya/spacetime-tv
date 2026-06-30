import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackToTop } from "../BackToTop";

describe("BackToTop", () => {
  let mainEl: HTMLDivElement;

  beforeEach(() => {
    mainEl = document.createElement("main");
    // jsdom doesn't support scrollTo — assign a mock directly
    mainEl.scrollTo = vi.fn() as unknown as typeof mainEl.scrollTo;
    // Set up a minimal document body
    document.body.innerHTML = "";
    document.body.appendChild(mainEl);
    // Set a reasonable clientHeight so scroll events work
    Object.defineProperty(mainEl, "clientHeight", { value: 800, configurable: true });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders a button with aria-label", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    expect(btn).toBeInTheDocument();
  });

  it("is hidden by default (opacity-0 + pointer-events-none)", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    expect(btn.className).toContain("opacity-0");
    expect(btn.className).toContain("pointer-events-none");
  });

  it("becomes visible when main scrolls past 600px", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { name: /scroll to top/i });

    // Simulate scroll past 600px
    Object.defineProperty(mainEl, "scrollTop", { value: 601, configurable: true });
    fireEvent.scroll(mainEl);

    expect(btn.className).toContain("opacity-100");
    expect(btn.className).toContain("pointer-events-auto");
  });

  it("becomes hidden again when scroll is <= 600px", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { name: /scroll to top/i });

    // Scroll past 600px → visible
    Object.defineProperty(mainEl, "scrollTop", { value: 800, configurable: true });
    fireEvent.scroll(mainEl);
    expect(btn.className).toContain("opacity-100");

    // Scroll back up → hidden
    Object.defineProperty(mainEl, "scrollTop", { value: 300, configurable: true });
    fireEvent.scroll(mainEl);
    expect(btn.className).toContain("opacity-0");
    expect(btn.className).toContain("pointer-events-none");
  });

  it("calls main.scrollTo({ top: 0, behavior: 'smooth' }) on click", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { name: /scroll to top/i });

    // Make visible first
    Object.defineProperty(mainEl, "scrollTop", { value: 601, configurable: true });
    fireEvent.scroll(mainEl);

    fireEvent.click(btn);

    expect(mainEl.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("does nothing when no main element exists", () => {
    document.body.innerHTML = ""; // remove the embedded main
    // Should not throw
    expect(() => render(<BackToTop />)).not.toThrow();
  });

  it("applies correct classes for fixed positioning", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    expect(btn.className).toContain("fixed");
    expect(btn.className).toContain("bottom-6");
    expect(btn.className).toContain("right-6");
    expect(btn.className).toContain("z-50");
  });

  it("renders ChevronUp icon", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { name: /scroll to top/i });
    // lucide icons render inline SVGs
    const svg = btn.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
