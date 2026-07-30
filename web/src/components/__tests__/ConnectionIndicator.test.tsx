import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ConnectionIndicator from "@/components/ConnectionIndicator";

describe("ConnectionIndicator", () => {
  it("renders 4 bars", () => {
    const { container } = render(
      <ConnectionIndicator connectionQuality="excellent" downloadSpeed={5000} stallCount={0} />,
    );
    const bars = container.querySelectorAll("span.block");
    expect(bars).toHaveLength(4);
  });

  it("shows all bars active for excellent quality", () => {
    const { container } = render(
      <ConnectionIndicator connectionQuality="excellent" downloadSpeed={5000} stallCount={0} />,
    );
    const bars = container.querySelectorAll("span.block");
    bars.forEach((bar) => {
      expect(bar.className).toContain("bg-green-500");
    });
  });

  it("shows 3 bars active for good quality", () => {
    const { container } = render(
      <ConnectionIndicator connectionQuality="good" downloadSpeed={1000} stallCount={0} />,
    );
    const bars = container.querySelectorAll("span.block");
    expect(bars[0].className).toContain("bg-green-500");
    expect(bars[1].className).toContain("bg-green-500");
    expect(bars[2].className).toContain("bg-green-500");
    expect(bars[3].className).toContain("bg-white/15");
  });

  it("shows 2 bars active for fair quality", () => {
    const { container } = render(
      <ConnectionIndicator connectionQuality="fair" downloadSpeed={500} stallCount={2} />,
    );
    const bars = container.querySelectorAll("span.block");
    expect(bars[0].className).toContain("bg-yellow-400");
    expect(bars[1].className).toContain("bg-yellow-400");
    expect(bars[2].className).toContain("bg-white/15");
    expect(bars[3].className).toContain("bg-white/15");
  });

  it("shows 1 bar active for poor quality", () => {
    const { container } = render(
      <ConnectionIndicator connectionQuality="poor" downloadSpeed={100} stallCount={5} />,
    );
    const bars = container.querySelectorAll("span.block");
    expect(bars[0].className).toContain("bg-red-500");
    expect(bars[1].className).toContain("bg-white/15");
    expect(bars[2].className).toContain("bg-white/15");
    expect(bars[3].className).toContain("bg-white/15");
  });

  it("sets aria-label with quality info", () => {
    const { getByLabelText } = render(
      <ConnectionIndicator connectionQuality="fair" downloadSpeed={500} stallCount={2} />,
    );
    expect(getByLabelText("Connection quality: fair")).toBeTruthy();
  });
});
