import { useState, useEffect } from "react";

// WebKit-prefixed fullscreen API (not in standard TS DOM types)
interface DocumentWithWebkit extends Document {
  webkitFullscreenElement: Element | null;
}

/**
 * Tracks browser fullscreen state via native events.
 * Supports standard Fullscreen API, WebKit prefix, and iOS
 * video fullscreen (webkitbeginfullscreen / webkitendfullscreen).
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
    const iosHandler = () => setIsFullscreen(true);
    const iosExitHandler = () => setIsFullscreen(false);

    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    // iOS Safari video fullscreen events
    document.addEventListener("webkitbeginfullscreen", iosHandler);
    document.addEventListener("webkitendfullscreen", iosExitHandler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
      document.removeEventListener("webkitbeginfullscreen", iosHandler);
      document.removeEventListener("webkitendfullscreen", iosExitHandler);
    };
  }, []);

  return { isFullscreen, setIsFullscreen };
}
