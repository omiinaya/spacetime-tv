/**
 * Swipe-to-go-back gesture for the video player on mobile.
 *
 * Tracks horizontal swipe gestures and navigates back when the
 * user swipes right past the threshold (80px with 1.5x directionality).
 */
import { useRef, useCallback } from "react";

export function useSwipeToGoBack() {
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  /** Build the back URL based on content type and session storage. */
  const getBackUrl = useCallback((type: "live" | "movie" | "series") => {
    let backUrl = "";
    try { backUrl = sessionStorage.getItem("stv_back_url") || ""; } catch {} // DOMException: storage quota
    if (!backUrl) {
      backUrl = type === "movie" ? "/movies" : type === "series" ? "/series" : "/live";
    }
    return backUrl;
  }, []);

  /** Navigate back to the previous page based on content type. */
  const goBack = useCallback((type: "live" | "movie" | "series") => {
    window.location.href = getBackUrl(type);
  }, [getBackUrl]);

  /** Handle touch start — record initial position for swipe detection. */
  const handleTouchStart = useCallback((
    e: React.TouchEvent,
    centerTouched: React.MutableRefObject<boolean>,
  ) => {
    if (centerTouched.current) {
      centerTouched.current = false;
      return;
    }
    if (e.touches.length === 1) {
      swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  /** Handle touch move — prevent default on horizontal swipes to avoid scrolling. */
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeStart.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - swipeStart.current.x;
    const dy = e.touches[0].clientY - swipeStart.current.y;
    if (Math.abs(dx) > Math.abs(dy) && dx > 30) {
      e.preventDefault();
    }
  }, []);

  /** Handle touch end — trigger goBack on right-swipe past threshold. */
  const handleTouchEnd = useCallback((
    e: React.TouchEvent,
    type: "live" | "movie" | "series",
  ) => {
    if (!swipeStart.current) return;
    const dx = (e.changedTouches[0]?.clientX || 0) - swipeStart.current.x;
    const dy = Math.abs((e.changedTouches[0]?.clientY || 0) - swipeStart.current.y);
    if (dx > 80 && dx > dy * 1.5) {
      goBack(type);
    }
    swipeStart.current = null;
  }, [goBack]);

  return { swipeStart, goBack, getBackUrl, handleTouchStart, handleTouchMove, handleTouchEnd };
}
