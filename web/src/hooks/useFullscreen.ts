import { useState, useEffect } from "react";

// WebKit-prefixed fullscreen API (not in standard TS DOM types)
interface DocumentWithWebkit extends Document {
  webkitFullscreenElement: Element | null;
}

/**
 * Tracks browser fullscreen state via native events.
 * Returns isFullscreen (synced from native) and a setter
 * for optimistic state updates when entering/exiting programmatically.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => {
      const doc = document as DocumentWithWebkit;
      setIsFullscreen(
        !!(document.fullscreenElement || doc.webkitFullscreenElement),
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
