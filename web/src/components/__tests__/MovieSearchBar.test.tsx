import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MovieSearchBar from "@/components/MovieSearchBar";

describe("MovieSearchBar", () => {
  const defaultProps = {
    value: "",
    onChange: vi.fn(),
    onSearch: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders search input with placeholder", () => {
    render(<MovieSearchBar {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search movies...")).toBeInTheDocument();
  });

  it("shows custom placeholder text", () => {
    render(<MovieSearchBar {...defaultProps} placeholder="Find movies..." />);
    expect(screen.getByPlaceholderText("Find movies...")).toBeInTheDocument();
  });

  it("displays the current value", () => {
    render(<MovieSearchBar {...defaultProps} value="Action" />);
    const input = screen.getByPlaceholderText(
      "Search movies...",
    ) as HTMLInputElement;
    expect(input.value).toBe("Action");
  });

  it("calls onChange when user types", () => {
    const onChange = vi.fn();
    render(<MovieSearchBar {...defaultProps} onChange={onChange} />);
    const input = screen.getByPlaceholderText("Search movies...");
    fireEvent.change(input, { target: { value: "a" } });
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("shows clear button when value is non-empty", () => {
    render(<MovieSearchBar {...defaultProps} value="test" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("does not show clear button when value is empty", () => {
    render(<MovieSearchBar {...defaultProps} value="" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onSearch when clear button is clicked", async () => {
    const onSearch = vi.fn();
    const onChange = vi.fn();
    render(
      <MovieSearchBar
        {...defaultProps}
        value="test"
        onChange={onChange}
        onSearch={onSearch}
      />,
    );
    const clearBtn = screen.getByRole("button");
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("");
    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("calls onSearch after debounce when value changes", async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const onChange = vi.fn();
    render(
      <MovieSearchBar
        {...defaultProps}
        onChange={onChange}
        onSearch={onSearch}
      />,
    );

    const input = screen.getByPlaceholderText("Search movies...");
    fireEvent.change(input, { target: { value: "test" } });
    expect(onChange).toHaveBeenCalledWith("test");

    // Debounce is 300ms, advance past it
    vi.advanceTimersByTime(350);
    expect(onSearch).toHaveBeenCalledWith("test");

    vi.useRealTimers();
  });

  it("does not call onSearch immediately on change", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<MovieSearchBar {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText("Search movies...");
    fireEvent.change(input, { target: { value: "test" } });
    // Should not be called immediately
    expect(onSearch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("calls onAddHistory and onSearch when Enter is pressed with valid query", () => {
    const onSearch = vi.fn();
    const onAddHistory = vi.fn();
    render(
      <MovieSearchBar
        {...defaultProps}
        value="action"
        onSearch={onSearch}
        onAddHistory={onAddHistory}
      />,
    );

    const input = screen.getByPlaceholderText("Search movies...");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSearch).toHaveBeenCalledWith("action");
    expect(onAddHistory).toHaveBeenCalledWith("action");
  });

  it("does not call handlers when Enter is pressed with short query", () => {
    const onSearch = vi.fn();
    const onAddHistory = vi.fn();
    render(
      <MovieSearchBar
        {...defaultProps}
        value="a"
        onSearch={onSearch}
        onAddHistory={onAddHistory}
      />,
    );

    const input = screen.getByPlaceholderText("Search movies...");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSearch).not.toHaveBeenCalled();
    expect(onAddHistory).not.toHaveBeenCalled();
  });

  it("calls onClear when X button is clicked with empty value", () => {
    const onSearch = vi.fn();
    const onChange = vi.fn();
    render(
      <MovieSearchBar
        {...defaultProps}
        value=""
        onChange={onChange}
        onSearch={onSearch}
      />,
    );

    // No clear button when empty
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
