import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGridKeyboardNav, useRowKeyboardNav } from "../useGridKeyboardNav";

describe("useGridKeyboardNav", () => {
  const defaultItemCount = 12;
  const onSelect = vi.fn();

  function createContainer(cols: number = 4): HTMLDivElement {
    const el = document.createElement("div");
    el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (let i = 0; i < defaultItemCount; i++) {
      const card = document.createElement("div");
      card.setAttribute("data-grid-idx", String(i));
      card.tabIndex = -1;
      el.appendChild(card);
    }
    return el;
  }

  beforeEach(() => {
    onSelect.mockClear();
  });

  it("starts with focusedIdx = -1", () => {
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: null }),
    );
    expect(result.current[0]).toBe(-1);
  });

  it("moves focus right with ArrowRight", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(1);
  });

  it("moves focus left with ArrowLeft", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 5);
    });
    expect(result.current[0]).toBe(4);
  });

  it("moves focus down by column count", () => {
    const container = createContainer(4);
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowDown",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 1);
    });
    expect(result.current[0]).toBe(5); // 1 + 4 columns
  });

  it("moves focus up by column count", () => {
    const container = createContainer(4);
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowUp",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 5);
    });
    expect(result.current[0]).toBe(1); // 5 - 4 columns
  });

  it("clamps right at last item", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, defaultItemCount - 1);
    });
    expect(result.current[0]).toBe(defaultItemCount - 1);
  });

  it("clamps left at 0", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(0);
  });

  it("calls onSelect on Enter", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "Enter",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 3);
    });
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("calls onSelect on Space", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: " ",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 7);
    });
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it("does nothing when not enabled", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(
        defaultItemCount,
        onSelect,
        { current: container },
        false,
      ),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(-1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ignores non-navigation keys", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "a",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(-1);
  });

  it("computes column count from gridTemplateColumns", () => {
    const container = createContainer(6);
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowDown",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(6); // 0 + 6 columns
  });

  it("sets focus on the target element", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const target = container.querySelector(
      '[data-grid-idx="2"]',
    ) as HTMLElement;
    const focusSpy = vi.spyOn(target, "focus");

    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 1);
    });

    expect(focusSpy).toHaveBeenCalled();
  });

  it("handles empty itemCount gracefully", () => {
    const container = createContainer();
    const { result } = renderHook(() =>
      useGridKeyboardNav(0, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(-1);
  });
});

describe("useRowKeyboardNav", () => {
  const defaultItemCount = 10;
  const onSelect = vi.fn();

  function createRow(): { container: HTMLDivElement; cards: HTMLElement[] } {
    const el = document.createElement("div");
    el.style.overflowX = "auto";
    const cards: HTMLElement[] = [];
    for (let i = 0; i < defaultItemCount; i++) {
      const card = document.createElement("div");
      card.setAttribute("data-row-idx", String(i));
      card.tabIndex = -1;
      // Mock getBoundingClientRect
      card.getBoundingClientRect = () => ({
        left: i * 200,
        right: (i + 1) * 200,
        top: 0,
        bottom: 100,
        width: 200,
        height: 100,
        x: i * 200,
        y: 0,
        toJSON: () => ({}),
      });
      el.appendChild(card);
      cards.push(card);
    }
    // Mock container bounding rect
    el.getBoundingClientRect = () => ({
      left: 0,
      right: 800,
      top: 0,
      bottom: 100,
      width: 800,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    return { container: el, cards };
  }

  beforeEach(() => {
    onSelect.mockClear();
  });

  it("starts with focusedIdx = -1", () => {
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: null }),
    );
    expect(result.current[0]).toBe(-1);
  });

  it("moves right with ArrowRight", () => {
    const { container } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 2);
    });
    expect(result.current[0]).toBe(3);
  });

  it("moves left with ArrowLeft", () => {
    const { container } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 5);
    });
    expect(result.current[0]).toBe(4);
  });

  it("calls onSelect on Enter", () => {
    const { container } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "Enter",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 3);
    });
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("calls onSelect on Space", () => {
    const { container } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: " ",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 3);
    });
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("does nothing when disabled", () => {
    const { container } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(
        defaultItemCount,
        onSelect,
        { current: container },
        false,
      ),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(-1);
  });

  it("ignores non-navigation keys", () => {
    const { container } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "Escape",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(-1);
  });

  it("clamps right at last item", () => {
    const { container } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, defaultItemCount - 1);
    });
    expect(result.current[0]).toBe(defaultItemCount - 1);
  });

  it("clamps left at 0", () => {
    const { container } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 0);
    });
    expect(result.current[0]).toBe(0);
  });

  it("sets focus on the target element", () => {
    const { container, cards } = createRow();
    const { result } = renderHook(() =>
      useRowKeyboardNav(defaultItemCount, onSelect, { current: container }),
    );
    const focusSpy = vi.spyOn(cards[3], "focus");
    const keyEvent = new KeyboardEvent("keydown", {
      key: "ArrowRight",
    }) as unknown as React.KeyboardEvent;
    act(() => {
      result.current[1](keyEvent, 2);
    });
    expect(focusSpy).toHaveBeenCalled();
  });
});
