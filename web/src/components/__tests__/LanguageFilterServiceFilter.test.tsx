import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LanguageFilter from "@/components/settings/LanguageFilter";
import ServiceFilter from "@/components/settings/ServiceFilter";

describe("LanguageFilter", () => {
  const prefixes = ["EN", "ES", "FR", "DE"];

  it("renders all language buttons plus All", () => {
    render(
      <LanguageFilter
        prefixes={prefixes}
        languages={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("EN")).toBeTruthy();
    expect(screen.getByText("ES")).toBeTruthy();
    expect(screen.getByText("FR")).toBeTruthy();
    expect(screen.getByText("DE")).toBeTruthy();
  });

  it("highlights All when no languages selected", () => {
    const { container } = render(
      <LanguageFilter
        prefixes={prefixes}
        languages={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const allBtn = container.querySelector("button");
    expect(allBtn?.className).toContain("bg-primary/15");
  });

  it("highlights selected languages", () => {
    const { container } = render(
      <LanguageFilter
        prefixes={prefixes}
        languages={["EN", "FR"]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      if (btn.textContent === "EN" || btn.textContent === "FR") {
        expect(btn.className).toContain("bg-primary/15");
      }
    });
  });

  it("shows selected count", () => {
    render(
      <LanguageFilter
        prefixes={prefixes}
        languages={["EN", "ES"]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("calls onToggle when language clicked", () => {
    const onToggle = vi.fn();
    render(
      <LanguageFilter
        prefixes={prefixes}
        languages={[]}
        onToggle={onToggle}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("EN"));
    expect(onToggle).toHaveBeenCalledWith("EN");
  });

  it("calls onClear when All clicked", () => {
    const onClear = vi.fn();
    render(
      <LanguageFilter
        prefixes={prefixes}
        languages={["EN"]}
        onToggle={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText("All"));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("ServiceFilter", () => {
  const services = ["Netflix", "HBO", "Prime"];

  it("renders all service buttons plus All", () => {
    render(
      <ServiceFilter
        services={services}
        enabledServices={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText("HBO")).toBeTruthy();
  });

  it("highlights enabled services", () => {
    const { container } = render(
      <ServiceFilter
        services={services}
        enabledServices={["HBO"]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      if (btn.textContent === "HBO") {
        expect(btn.className).toContain("bg-primary/15");
      }
    });
  });

  it("calls onToggle when service clicked", () => {
    const onToggle = vi.fn();
    render(
      <ServiceFilter
        services={services}
        enabledServices={[]}
        onToggle={onToggle}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Netflix"));
    expect(onToggle).toHaveBeenCalledWith("Netflix");
  });

  it("calls onClear when All clicked", () => {
    const onClear = vi.fn();
    render(
      <ServiceFilter
        services={services}
        enabledServices={["Netflix"]}
        onToggle={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText("All"));
    expect(onClear).toHaveBeenCalled();
  });
});
