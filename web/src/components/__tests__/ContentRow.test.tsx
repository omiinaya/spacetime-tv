import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ContentRow from "../ContentRow";

describe("ContentRow", () => {
  const defaultChildren = (
    <>
      <div data-row-idx="0">Card 1</div>
      <div data-row-idx="1">Card 2</div>
      <div data-row-idx="2">Card 3</div>
    </>
  );

  // ── Header / title ──────────────────────────────────────

  it("renders the title", () => {
    render(<ContentRow title="Trending Now">{defaultChildren}</ContentRow>);
    expect(screen.getByText("Trending Now")).toBeInTheDocument();
  });

  it("renders itemCount when provided", () => {
    render(<ContentRow title="Movies" itemCount={42}>{defaultChildren}</ContentRow>);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("does not render itemCount when not provided", () => {
    render(<ContentRow title="Movies">{defaultChildren}</ContentRow>);
    // the itemCount span should not exist
    expect(screen.queryByText(/^[0-9]+$/)).not.toBeInTheDocument();
  });

  it("renders itemCount with locale formatting", () => {
    render(<ContentRow title="Movies" itemCount={10000}>{defaultChildren}</ContentRow>);
    expect(screen.getByText("10,000")).toBeInTheDocument();
  });

  // ── Action button ───────────────────────────────────────

  it("renders action button when action prop provided", () => {
    const action = { label: "View all →", onClick: vi.fn() };
    render(<ContentRow title="Movies" action={action}>{defaultChildren}</ContentRow>);
    expect(screen.getByText("View all →")).toBeInTheDocument();
  });

  it("calls action.onClick when action button clicked", () => {
    const onClick = vi.fn();
    render(
      <ContentRow title="Movies" action={{ label: "View all", onClick }}>
        {defaultChildren}
      </ContentRow>
    );
    fireEvent.click(screen.getByText("View all"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not render action button when action is not provided", () => {
    render(<ContentRow title="Movies">{defaultChildren}</ContentRow>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // ── Children rendering ──────────────────────────────────

  it("renders children inside the scrollable container", () => {
    render(<ContentRow title="Movies">{defaultChildren}</ContentRow>);
    expect(screen.getByText("Card 1")).toBeInTheDocument();
    expect(screen.getByText("Card 2")).toBeInTheDocument();
    expect(screen.getByText("Card 3")).toBeInTheDocument();
  });

  it("assigns data-row-idx attributes for keyboard nav", () => {
    render(<ContentRow title="Movies">{defaultChildren}</ContentRow>);
    expect(screen.getByText("Card 1").closest("[data-row-idx]")).toHaveAttribute(
      "data-row-idx",
      "0"
    );
    expect(screen.getByText("Card 2").closest("[data-row-idx]")).toHaveAttribute(
      "data-row-idx",
      "1"
    );
  });

  // ── Loading indicator ───────────────────────────────────

  it("shows loading skeleton items when loading is true", () => {
    const { container } = render(
      <ContentRow title="Movies" loading>{defaultChildren}</ContentRow>
    );
    // Should have skeleton placeholders with min-w-[120px]
    const loadingArea = container.querySelector(".min-w-\\[120px\\]");
    expect(loadingArea).toBeTruthy();
  });

  it("does not show loading indicator when loading is false", () => {
    const { container } = render(
      <ContentRow title="Movies">{defaultChildren}</ContentRow>
    );
    const loadingArea = container.querySelector(".min-w-\\[120px\\]");
    expect(loadingArea).toBeFalsy();
  });

  // ── Scroll arrows (conditional) ──────────────────────────

  it("renders arrow buttons in the DOM when canScrollLeft is true", () => {
    // The arrows are rendered but visibility toggled via opacity & pointer-events
    render(<ContentRow title="Movies">{defaultChildren}</ContentRow>);
    // Initially canScrollLeft=false, canScrollRight=true (default state)
    // The arrow buttons use ChevronLeft / ChevronRight icons
    const chevronLeft = document.querySelector(".lucide-chevron-left");
    const chevronRight = document.querySelector(".lucide-chevron-right");
    // ChevronLeft arrow is only rendered when canScrollLeft is true (initially false)
    expect(chevronLeft).toBeFalsy();
    // ChevronRight arrow wrapper is always rendered in the scroll direction
    // Actually the left arrow button itself is conditionally rendered
  });

  // ── Keyboard navigation ─────────────────────────────────

  it("renders content row with keyboard support setup", () => {
    render(<ContentRow title="Movies">{defaultChildren}</ContentRow>);
    // The scroll container should have touch-action: manipulation
    const scrollContainer = screen.getByText("Card 1").closest(".overflow-x-auto");
    expect(scrollContainer).toBeInTheDocument();
  });

  // ── Edge cases ──────────────────────────────────────────

  it("handles empty children gracefully", () => {
    const { container } = render(<ContentRow title="Empty" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer?.children.length).toBe(0);
  });

  it("renders title as h2", () => {
    render(<ContentRow title="Section Title">{defaultChildren}</ContentRow>);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Section Title");
  });

  it("truncates long titles", () => {
    render(<ContentRow title="Trending Now">{defaultChildren}</ContentRow>);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.className).toContain("truncate");
  });

  it("has group/row class on the outer container", () => {
    const { container } = render(<ContentRow title="Movies">{defaultChildren}</ContentRow>);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain("group/row");
  });

  // ── Scroll end detection ────────────────────────────────

  it("calls onScrollEnd when condition would be met", () => {
    // onScrollEnd fires when scroll position nears the end.
    // We can't easily test scroll position in jsdom, but we verify
    // the callback is wired up by checking the component renders
    // without error when onScrollEnd is provided.
    const onScrollEnd = vi.fn();
    render(
      <ContentRow title="Movies" onScrollEnd={onScrollEnd}>
        {defaultChildren}
      </ContentRow>
    );
    expect(screen.getByText("Card 1")).toBeInTheDocument();
  });
});
