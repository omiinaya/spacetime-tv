/**
 * Controls visibility with auto-hide timer for video player overlays.
 *
 * Tracks whether overlay controls should be visible and provides a
 * temporary-show mode that auto-hides after 3 seconds of inactivity.
 */
import { useState, useRef, useCallback } from "react";

export function useControlsVisibility() {
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback((temporary = false) => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (temporary) {
      controlsTimer.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, []);

  const hideControls = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    setControlsVisible(false);
  }, []);

  return { controlsVisible, showControls, hideControls };
}
