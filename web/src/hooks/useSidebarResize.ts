import { useCallback, useRef, useState } from "react";

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 400;
export const SIDEBAR_DEFAULT = 240;

/**
 * Sidebar width state + drag-to-resize logic.
 *
 * Persists the width to localStorage (key `stv_sidebar_width`, with a legacy
 * fallback read from `stv-sidebar-width`). Returns the current width and an
 * `onResizeStart` handler to attach to a drag handle; the component attaches
 * its own mousemove/mouseup listeners while dragging.
 */
export function useSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved =
      localStorage.getItem("stv_sidebar_width") ||
      localStorage.getItem("stv-sidebar-width");
    return saved
      ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parseInt(saved, 10)))
      : SIDEBAR_DEFAULT;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const dragging = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX));
      setSidebarWidth(newWidth);
      sidebarWidthRef.current = newWidth;
    };
    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(
        "stv_sidebar_width",
        String(sidebarWidthRef.current),
      );
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  return { sidebarWidth, onResizeStart: handleResizeStart };
}
