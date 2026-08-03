/**
 * Tests for MovieLanguageSelector + langLabel — the multi-language overlay
 * language switcher on movies.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import {
  MovieLanguageSelector,
  langLabel,
  LANG_LABELS,
} from "@/components/movie/MovieLanguageSelector";
import type { MovieLanguage } from "@/lib/types";

const langs: MovieLanguage[] = [
  { code: "EN", name: "English" },
  { code: "ES", name: "Spanish" },
  { code: "ZZ", name: "Zulu" },
];

function renderSelector(
  overrides: Partial<Parameters<typeof MovieLanguageSelector>[0]> = {},
) {
  const props = {
    languages: langs,
    selectedLang: langs[0],
    onSelect: vi.fn(),
    isOpen: false,
    onToggle: vi.fn(),
    menuRef: createRef<HTMLDivElement>(),
    ...overrides,
  };
  render(<MovieLanguageSelector {...props} />);
  return props;
}

describe("langLabel", () => {
  it("maps known codes to display names", () => {
    expect(langLabel("EN")).toBe("English");
    expect(langLabel("FR")).toBe("French");
    expect(langLabel("QC")).toBe("Canadian French");
  });

  it("falls back to the raw code for unknown codes", () => {
    expect(langLabel("XX")).toBe("XX");
    expect(langLabel("")).toBe("");
  });

  it("covers every code in the LANG_LABELS map with itself", () => {
    for (const code of Object.keys(LANG_LABELS)) {
      expect(langLabel(code)).not.toBe("");
    }
  });
});

describe("MovieLanguageSelector", () => {
  it("shows the selected language label on the trigger", () => {
    renderSelector();
    expect(screen.getByText("English")).toBeTruthy();
  });

  it("does not render the menu when closed", () => {
    renderSelector();
    expect(screen.queryByText("Spanish")).toBeNull();
  });

  it("opens the menu and lists all languages when isOpen", () => {
    renderSelector({ isOpen: true });
    expect(screen.getAllByText("English").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Spanish")).toBeTruthy();
    expect(screen.getByText("ZZ")).toBeTruthy();
  });

  it("marks the selected language with a check", () => {
    renderSelector({ isOpen: true });
    const es = screen.getByText("Spanish").closest("button")!;
    const en = screen.getAllByText("English")[1].closest("button")!;
    // The selected language (English) gets the check; others don't.
    expect(en.textContent).toContain("✓");
    expect(es.textContent).not.toContain("✓");
  });

  it("selecting a language calls onSelect and closes the menu", () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    renderSelector({ isOpen: true, onSelect, onToggle });

    fireEvent.click(screen.getByText("Spanish"));
    expect(onSelect).toHaveBeenCalledWith(langs[1]);
    expect(onToggle).toHaveBeenCalled();
  });

  it("clicking the trigger toggles the menu", () => {
    const onToggle = vi.fn();
    renderSelector({ onToggle });
    fireEvent.click(screen.getByText("English"));
    expect(onToggle).toHaveBeenCalled();
  });
});
