import { useEffect, useRef } from "react";

/**
 * Focus trap hook for modal dialogs.
 *
 * Keeps keyboard focus inside the given container element when the dialog
 * is open. Restores focus to the previously focused element on cleanup.
 *
 * @param containerRef - Ref to the dialog container element
 * @param active - Whether the focus trap is active (dialog open)
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    // Save the currently focused element so we can restore focus on close
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Focus the first focusable element inside the container
    const container = containerRef.current;
    if (container) {
      const focusable = getFocusableElements(container);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        // Fallback: focus the container itself if it has a tabIndex
        container.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !containerRef.current) return;

      const focusable = getFocusableElements(containerRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the element that was focused before opening
      previousFocusRef.current?.focus();
    };
  }, [active, containerRef]);
}

/** Get all focusable elements inside a container, sorted by tab order. */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ];
  return Array.from(
    container.querySelectorAll<HTMLElement>(selectors.join(", ")),
  ).filter(
    (el) => el.tabIndex >= 0 && el.offsetParent !== null, // visible
  );
}
