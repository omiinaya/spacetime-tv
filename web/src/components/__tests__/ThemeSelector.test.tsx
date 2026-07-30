import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeSelector from "@/components/settings/ThemeSelector";

describe("ThemeSelector", () => {
  it("renders three theme buttons", () => {
    render(<ThemeSelector theme="dark" onUpdate={vi.fn()} />);
    expect(screen.getByText("Dark")).toBeTruthy();
    expect(screen.getByText("Light")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
  });

  it("highlights the active theme", () => {
    const { container } = render(
      <ThemeSelector theme="light" onUpdate={vi.fn()} />,
    );
    const buttons = container.querySelectorAll("button");
    const lightBtn = Array.from(buttons).find((b) => b.textContent === "Light");
    expect(lightBtn?.className).toContain("bg-primary/15");
  });

  it("calls onUpdate when a theme button is clicked", () => {
    const onUpdate = vi.fn();
    render(<ThemeSelector theme="dark" onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText("Light"));
    expect(onUpdate).toHaveBeenCalledWith({ theme: "light" });
  });

  it("calls onUpdate with system when System is clicked", () => {
    const onUpdate = vi.fn();
    render(<ThemeSelector theme="dark" onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText("System"));
    expect(onUpdate).toHaveBeenCalledWith({ theme: "system" });
  });
});
