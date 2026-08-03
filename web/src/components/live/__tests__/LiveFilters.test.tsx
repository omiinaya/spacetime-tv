/**
 * Tests for CategoryTabs + LiveSearchBar — the LiveTV filter/search bar.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryTabs } from "@/components/live/CategoryTabs";
import { LiveSearchBar } from "@/components/live/LiveSearchBar";

const categories = [
  { category_id: "1", category_name: "General" },
  { category_id: "2", category_name: "Sports" },
  { category_id: "3", category_name: "News" },
];

describe("CategoryTabs", () => {
  it("renders skeleton while loading", () => {
    render(
      <CategoryTabs
        categories={categories}
        activeCat="__all__"
        loading
        onSelect={() => {}}
      />,
    );
    // 8 skeleton tabs render; no real category buttons
    expect(screen.queryByText("All")).toBeNull();
    expect(screen.queryByText("Sports")).toBeNull();
  });

  it("renders All + every category with aria-pressed", () => {
    render(
      <CategoryTabs
        categories={categories}
        activeCat="2"
        loading={false}
        onSelect={() => {}}
      />,
    );
    const all = screen.getByText("All");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.getByText("Sports").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByText("News")).toBeTruthy();
  });

  it("calls onSelect with the clicked category id", () => {
    const onSelect = vi.fn();
    render(
      <CategoryTabs
        categories={categories}
        activeCat="__all__"
        loading={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("Sports"));
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("calls onSelect with __all__ for the All tab", () => {
    const onSelect = vi.fn();
    render(
      <CategoryTabs
        categories={categories}
        activeCat="2"
        loading={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("All"));
    expect(onSelect).toHaveBeenCalledWith("__all__");
  });
});

describe("LiveSearchBar", () => {
  const base = {
    searchQuery: "",
    allLoading: false,
    allStreamsLength: 48213,
    favoritesSize: 0,
    favoritesOnly: false,
    onSearchChange: vi.fn(),
    onToggleFavoritesOnly: vi.fn(),
    onClearSearch: vi.fn(),
  };

  it("shows channel count in placeholder", () => {
    render(<LiveSearchBar {...base} />);
    const input = screen.getByLabelText(
      "Search live channels",
    ) as HTMLInputElement;
    expect(input.placeholder).toContain("48,213");
    expect(input.disabled).toBe(false);
  });

  it("shows loading placeholder and disables input while loading", () => {
    render(<LiveSearchBar {...base} allLoading />);
    const input = screen.getByLabelText(
      "Search live channels",
    ) as HTMLInputElement;
    expect(input.placeholder).toBe("Loading channels...");
    expect(input.disabled).toBe(true);
  });

  it("fires onSearchChange on typing", () => {
    const onSearchChange = vi.fn();
    render(<LiveSearchBar {...base} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByLabelText("Search live channels"), {
      target: { value: "espn" },
    });
    expect(onSearchChange).toHaveBeenCalledWith("espn");
  });

  it("shows clear button only when a query exists and clears on click", () => {
    const onClearSearch = vi.fn();
    const { rerender } = render(
      <LiveSearchBar {...base} onClearSearch={onClearSearch} />,
    );
    expect(screen.queryByLabelText("Clear search")).toBeNull();

    rerender(
      <LiveSearchBar
        {...base}
        searchQuery="abc"
        onClearSearch={onClearSearch}
      />,
    );
    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(onClearSearch).toHaveBeenCalled();
  });

  it("hides favorites toggle when no favorites", () => {
    render(<LiveSearchBar {...base} favoritesSize={0} />);
    expect(screen.queryByLabelText("Show favorites only")).toBeNull();
  });

  it("shows favorites toggle with count and active state", () => {
    const onToggleFavoritesOnly = vi.fn();
    render(
      <LiveSearchBar
        {...base}
        favoritesSize={3}
        favoritesOnly
        onToggleFavoritesOnly={onToggleFavoritesOnly}
      />,
    );
    const toggle = screen.getByLabelText("Show all channels");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(onToggleFavoritesOnly).toHaveBeenCalled();
  });
});
