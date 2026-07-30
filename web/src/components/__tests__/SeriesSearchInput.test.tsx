import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SeriesSearchInput from "@/components/SeriesSearchInput";

describe("SeriesSearchInput", () => {
  it("renders an input with the default placeholder", () => {
    render(
      <SeriesSearchInput value="" onChange={() => {}} />,
    );
    expect(
      screen.getByPlaceholderText("Filter series..."),
    ).toBeInTheDocument();
  });

  it("shows a custom placeholder when provided", () => {
    render(
      <SeriesSearchInput
        value=""
        onChange={() => {}}
        placeholder="Search shows..."
      />,
    );
    expect(
      screen.getByPlaceholderText("Search shows..."),
    ).toBeInTheDocument();
  });

  it("displays the current value in the input", () => {
    render(
      <SeriesSearchInput
        value="Star Trek"
        onChange={() => {}}
      />,
    );
    const input = screen.getByDisplayValue("Star Trek");
    expect(input).toBeInTheDocument();
  });

  it("calls onChange when the user types", () => {
    const onChange = vi.fn();
    render(
      <SeriesSearchInput value="" onChange={onChange} />,
    );
    const input = screen.getByPlaceholderText("Filter series...");
    fireEvent.change(input, { target: { value: "S" } });
    expect(onChange).toHaveBeenCalledWith("S");
  });

  it("shows a clear X button when value is non-empty", () => {
    render(
      <SeriesSearchInput
        value="Star"
        onChange={() => {}}
      />,
    );
    // The X button is rendered as a <button> child
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("hides the clear X button when value is empty", () => {
    render(
      <SeriesSearchInput value="" onChange={() => {}} />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("clears the input when the X button is clicked", () => {
    const onChange = vi.fn();
    render(
      <SeriesSearchInput value="Star" onChange={onChange} />,
    );
    const clearButton = screen.getByRole("button");
    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
