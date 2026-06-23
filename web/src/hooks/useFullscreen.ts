import { useEffect, useState, useCallback } from "react";

/**
 * Tracks browser fullscreen state via native events.
 * Returns isFullscreen (synced from native) and a setter
 * for optimistic state updates when entering/exiting programmatically.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(
        !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
      );
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  return { isFullscreen, setIsFullscreen };
}
