import { useEffect } from "react";

/**
 * Locks body scroll and listens for Escape key to call onClose.
 * Used by overlays — prevents background scrolling on mobile
 * (CSS-only approaches don't work on iOS Safari).
 */
export function useLockBodyScroll(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);
}
