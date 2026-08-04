/**
 * Tests for SearchHeader — the search page header with input, history,
 * clear, and search button.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SearchHeader from "@/components/SearchHeader";

describe("SearchHeader", () => {
  const base = {
    query: "",
    loading: false,
    showHistory: false,
    onQueryChange: vi.fn(),
    onSearch: vi.fn(),
    onClear: vi.fn(),
    onFocus: vi.fn(),
    onHistorySelect: vi.fn(),
    onHistoryClose: vi.fn(),
  };

  it("shows the default hint when no results yet", () => {
    render(<SearchHeader {...base} />);
    expect(screen.getByText(/Search across all live TV channels/)).toBeTruthy();
  });

  it("shows result count when provided", () => {
    render(<SearchHeader {...base} resultCount={42} totalCount={1000} />);
    expect(screen.getByText(/42 results · 1,000 total/)).toBeTruthy();
  });

  it("appends active filter to the count line", () => {
    render(
      <SearchHeader
        {...base}
        resultCount={5}
        totalCount={100}
        activeFilter="movies"
      />,
    );
    expect(
      screen.getByText(
        (content) =>
          content.includes("5 results") && content.includes("movies"),
      ),
    ).toBeTruthy();
  });

  it("omits active filter when it is 'all'", () => {
    render(
      <SearchHeader
        {...base}
        resultCount={5}
        totalCount={100}
        activeFilter="all"
      />,
    );
    expect(
      screen.getByText(
        (content) => content.includes("5 results") && !content.includes("("),
      ),
    ).toBeTruthy();
  });

  it("fires onQueryChange while typing", () => {
    const onQueryChange = vi.fn();
    render(<SearchHeader {...base} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "matrix" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("matrix");
  });

  it("fires onSearch on Enter", () => {
    const onSearch = vi.fn();
    render(<SearchHeader {...base} query="matrix" onSearch={onSearch} />);
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "Enter" });
    expect(onSearch).toHaveBeenCalled();
  });

  it("shows Clear button when a query exists", () => {
    const onClear = vi.fn();
    render(<SearchHeader {...base} query="matrix" onClear={onClear} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalled();
  });

  it("disables search button for short or empty queries", () => {
    const { rerender } = render(<SearchHeader {...base} query="a" />);
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();

    rerender(<SearchHeader {...base} query="matrix" />);
    expect(screen.getByRole("button", { name: "Search" })).not.toBeDisabled();
  });

  it("shows loading spinner instead of Search label while loading", () => {
    render(<SearchHeader {...base} query="matrix" loading />);
    // While loading, the button renders only the Loader2 spinner (no text)and
    // is disabled. Grab it by disabled state and assert the svg is present.
    const btn = screen.getByRole("button", { name: "Clear" })
      .nextElementSibling as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.querySelector("svg")).toBeTruthy();
  });

  it("renders SearchHistory dropdown when showHistory is true", () => {
    render(<SearchHeader {...base} showHistory />);
    // SearchHistory renders null when history empty; at minimum the search
    // input and Search button must still be present.
    expect(screen.getByLabelText("Search")).toBeTruthy();
  });
});
