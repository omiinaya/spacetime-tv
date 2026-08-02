import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HiddenCategoriesSection from "@/components/settings/HiddenCategoriesSection";

describe("HiddenCategoriesSection", () => {
  const allCats = [
    { id: "1", name: "News", type: "Live TV" },
    { id: "2", name: "Sports", type: "Live TV" },
    { id: "3", name: "Action Movies", type: "Movies" },
  ];

  it("renders all categories", () => {
    render(
      <HiddenCategoriesSection
        categories={allCats}
        hiddenIds={[]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("News")).toBeTruthy();
    expect(screen.getByText("Sports")).toBeTruthy();
    expect(screen.getByText("Action Movies")).toBeTruthy();
  });

  it("shows hidden count", () => {
    render(
      <HiddenCategoriesSection
        categories={allCats}
        hiddenIds={["1"]}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("1 hidden")).toBeTruthy();
  });

  it("marks hidden items with line-through", () => {
    const { container } = render(
      <HiddenCategoriesSection
        categories={allCats}
        hiddenIds={["1"]}
        onToggle={vi.fn()}
      />,
    );
    const spans = container.querySelectorAll("span.truncate");
    const newsSpan = Array.from(spans).find((s) => s.textContent === "News");
    expect(newsSpan?.className).toContain("line-through");
  });

  it("filters categories by search", () => {
    render(
      <HiddenCategoriesSection
        categories={allCats}
        hiddenIds={[]}
        onToggle={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Search categories...");
    fireEvent.change(input, { target: { value: "News" } });
    expect(screen.getByText("News")).toBeTruthy();
    expect(screen.queryByText("Sports")).toBeNull();
  });

  it("calls onToggle when category clicked", () => {
    const onToggle = vi.fn();
    render(
      <HiddenCategoriesSection
        categories={allCats}
        hiddenIds={[]}
        onToggle={onToggle}
      />,
    );
    // Find the toggle button for News (has an accessible name now)
    const btn = screen.getByRole("button", { name: "Hide News" });
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith("1");
  });

  it("shows empty state when no categories match filter", () => {
    render(
      <HiddenCategoriesSection
        categories={allCats}
        hiddenIds={[]}
        onToggle={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Search categories...");
    fireEvent.change(input, { target: { value: "ZZZZZZ" } });
    expect(screen.getByText("No categories found")).toBeTruthy();
  });
});
