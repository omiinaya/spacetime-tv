import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SeriesHeader from "@/components/SeriesHeader";

describe("SeriesHeader", () => {
  it('renders the "Series" heading', () => {
    render(<SeriesHeader categoryCount={0} />);
    expect(
      screen.getByText("Series"),
    ).toBeInTheDocument();
  });

  it("shows the category count when it is greater than 0", () => {
    render(<SeriesHeader categoryCount={42} />);
    expect(
      screen.getByText("42 categories"),
    ).toBeInTheDocument();
  });

  it("does not render an empty count string when count is 0", () => {
    const { container } = render(
      <SeriesHeader categoryCount={0} />,
    );
    // The <p> tag containing the count should be empty
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    // The count text should not appear
    expect(
      screen.queryByText("0 categories"),
    ).not.toBeInTheDocument();
  });
});
