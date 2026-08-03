/**
 * Tests for SearchHistory — the recent-searches dropdown in the search bar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchHistory } from "@/components/SearchHistory";

const KEY = "stv_search_history";

function seed(queries: string[]) {
  localStorage.setItem(KEY, JSON.stringify(queries));
}

describe("SearchHistory", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("renders nothing when hidden", () => {
    const { container } = render(
      <SearchHistory show={false} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when history is empty", () => {
    const { container } = render(
      <SearchHistory show onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows recent searches when visible", () => {
    seed(["matrix", "inception"]);
    render(<SearchHistory show onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Recent Searches")).toBeTruthy();
    expect(screen.getByText("matrix")).toBeTruthy();
    expect(screen.getByText("inception")).toBeTruthy();
  });

  it("selecting a query calls onSelect and closes", () => {
    seed(["matrix"]);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<SearchHistory show onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByText("matrix"));
    expect(onSelect).toHaveBeenCalledWith("matrix");
    expect(onClose).toHaveBeenCalled();
  });

  it("clearing all empties the list", () => {
    seed(["matrix", "godone"]);
    render(<SearchHistory show onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(screen.queryByText("matrix")).toBeNull();
    expect(screen.queryByText("godone")).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("removes a single query", () => {
    seed(["matrix", "godone"]);
    render(<SearchHistory show onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(
      screen.getByLabelText('Remove "matrix" from search history'),
    );
    expect(screen.queryByText("matrix")).toBeNull();
    expect(screen.getByText("godone")).toBeTruthy();
  });

  it("closes on outside click", () => {
    seed(["matrix"]);
    const onClose = vi.fn();
    document.body.innerHTML = '<div id="outside">outside</div>';
    render(<SearchHistory show onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.mouseDown(document.getElementById("outside")!);
    expect(onClose).toHaveBeenCalled();
  });
});
