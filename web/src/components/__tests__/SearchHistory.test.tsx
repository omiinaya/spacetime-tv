/**
 * Tests for the SearchHistory component.
 *
 * SearchHistory shows a dropdown of recent searches when `show` is true
 * and history is non-empty. Supports clear all and item selection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchHistory } from "@/components/SearchHistory";

// Mock the searchHistory lib
const mockGetSearchHistory = vi.fn();
const mockAddSearchHistory = vi.fn();
const mockClearSearchHistory = vi.fn();

vi.mock("@/lib/searchHistory", () => ({
  getSearchHistory: (...args: unknown[]) => mockGetSearchHistory(...args),
  addSearchHistory: (...args: unknown[]) => mockAddSearchHistory(...args),
  clearSearchHistory: (...args: unknown[]) => mockClearSearchHistory(...args),
}));

describe("SearchHistory", () => {
  const onSelect = vi.fn();
  const onClose = vi.fn();

  const sampleHistory = ["inception", "star wars", "the matrix"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSearchHistory.mockReturnValue(sampleHistory);
  });

  it("renders nothing when show is false", () => {
    const { container } = render(
      <SearchHistory onSelect={onSelect} show={false} onClose={onClose} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when history is empty", () => {
    mockGetSearchHistory.mockReturnValue([]);
    const { container } = render(
      <SearchHistory onSelect={onSelect} show={true} onClose={onClose} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders history items when show is true", () => {
    render(
      <SearchHistory onSelect={onSelect} show={true} onClose={onClose} />,
    );

    expect(screen.getByText("inception")).toBeInTheDocument();
    expect(screen.getByText("star wars")).toBeInTheDocument();
    expect(screen.getByText("the matrix")).toBeInTheDocument();
  });

  it('shows "Recent Searches" header and "Clear all" button', () => {
    render(
      <SearchHistory onSelect={onSelect} show={true} onClose={onClose} />,
    );

    expect(screen.getByText("Recent Searches")).toBeInTheDocument();
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("calls onSelect and onClose when a history item is clicked", () => {
    render(
      <SearchHistory onSelect={onSelect} show={true} onClose={onClose} />,
    );

    fireEvent.click(screen.getByText("inception"));

    expect(mockAddSearchHistory).toHaveBeenCalledWith("inception");
    expect(onSelect).toHaveBeenCalledWith("inception");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls clearSearchHistory when Clear all is clicked", () => {
    render(
      <SearchHistory onSelect={onSelect} show={true} onClose={onClose} />,
    );

    fireEvent.click(screen.getByText("Clear all"));

    expect(mockClearSearchHistory).toHaveBeenCalled();
    expect(screen.queryByText("inception")).not.toBeInTheDocument();
  });

  it("closes on outside click", () => {
    render(
      <SearchHistory onSelect={onSelect} show={true} onClose={onClose} />,
    );

    // Click outside the dropdown
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalled();
  });

  it("does not close on click inside the dropdown", () => {
    render(
      <SearchHistory onSelect={onSelect} show={true} onClose={onClose} />,
    );

    // Click inside the dropdown
    const dropdown = screen.getByText("Recent Searches").closest("div");
    expect(dropdown).not.toBeNull();
    fireEvent.mouseDown(dropdown!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("refreshes history when show changes to true", () => {
    const { rerender } = render(
      <SearchHistory onSelect={onSelect} show={false} onClose={onClose} />,
    );

    // Initially show=false, history should NOT be fetched
    expect(mockGetSearchHistory).not.toHaveBeenCalled();

    // Re-render with show=true
    rerender(
      <SearchHistory onSelect={onSelect} show={true} onClose={onClose} />,
    );

    expect(mockGetSearchHistory).toHaveBeenCalledTimes(1);
  });
});
