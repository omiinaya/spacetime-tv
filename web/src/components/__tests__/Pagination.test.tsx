import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Pagination } from "../Pagination";

describe("Pagination", () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    onPageChange: vi.fn(),
  };

  // ── Visibility & early return ────────────────────────────

  it("renders nothing when totalPages <= 1", () => {
    const { container } = render(
      <Pagination {...defaultProps} totalPages={1} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders pagination controls when totalPages > 1", () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
  });

  // ── Previous / Next buttons ──────────────────────────────

  it("disables Previous on first page", () => {
    render(<Pagination {...defaultProps} currentPage={1} />);
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
  });

  it("disables Next on last page", () => {
    render(<Pagination {...defaultProps} currentPage={10} />);
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("enables Previous after first page", () => {
    render(<Pagination {...defaultProps} currentPage={3} />);
    expect(screen.getByLabelText("Previous page")).not.toBeDisabled();
  });

  it("enables Next before last page", () => {
    render(<Pagination {...defaultProps} currentPage={3} />);
    expect(screen.getByLabelText("Next page")).not.toBeDisabled();
  });

  it("calls onPageChange with prev page on Previous click", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        {...defaultProps}
        currentPage={5}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("calls onPageChange with next page on Next click", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        {...defaultProps}
        currentPage={5}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(6);
  });

  // ── Page number buttons ──────────────────────────────────

  it("renders page 1 button", () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders last page button", () => {
    render(<Pagination {...defaultProps} totalPages={10} />);
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("highlights current page button", () => {
    render(<Pagination {...defaultProps} currentPage={3} />);
    const btn = screen.getByText("3");
    expect(btn.className).toContain("bg-primary");
  });

  it("does not highlight non-current page button", () => {
    render(<Pagination {...defaultProps} currentPage={3} />);
    const btn = screen.getByText("1");
    expect(btn.className).not.toContain("bg-primary");
  });

  it("calls onPageChange with page number on click", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        {...defaultProps}
        currentPage={5}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByText("5"));
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  // ── Ellipsis ─────────────────────────────────────────────

  it("shows ellipsis when pages are skipped", () => {
    render(<Pagination {...defaultProps} currentPage={5} totalPages={20} />);
    const ellipsis = screen.getAllByText("…");
    expect(ellipsis.length).toBeGreaterThanOrEqual(1);
  });

  it("does not show ellipsis when all pages fit in the visible range", () => {
    render(<Pagination {...defaultProps} currentPage={3} totalPages={5} />);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  // ── Jump to page ─────────────────────────────────────────

  it("renders jump-to-page input", () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });

  it("jump input has min=1 and max=totalPages", () => {
    render(<Pagination {...defaultProps} totalPages={25} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("max", "25");
  });

  it("calls onPageChange with valid jump value on Enter", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPageChange).toHaveBeenCalledWith(7);
  });

  it("clears input after successful jump", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
  });

  it("does not call onPageChange for out-of-range jump value", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("does not call onPageChange for non-numeric jump value", () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  // ── Edge cases ──────────────────────────────────────────

  it("handles exactly 2 pages — no ellipsis needed", () => {
    render(<Pagination {...defaultProps} currentPage={1} totalPages={2} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  it("handles large page counts with proper windowing", () => {
    render(<Pagination {...defaultProps} currentPage={50} totalPages={100} />);
    // Should show 1, ..., 48-52, ..., 100
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getByText("52")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    const ellipsis = screen.getAllByText("…");
    expect(ellipsis).toHaveLength(2);
  });

  it("handles current page near start without leading ellipsis", () => {
    render(<Pagination {...defaultProps} currentPage={1} totalPages={10} />);
    // Should show 1, 2, 3, ..., 10
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("handles current page near end without trailing ellipsis", () => {
    render(<Pagination {...defaultProps} currentPage={10} totalPages={10} />);
    // Should show 1, ..., 8, 9, 10
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("has accessible aria-labels on navigation buttons", () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
  });
});
