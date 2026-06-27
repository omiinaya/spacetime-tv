import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Centralized keyboard shortcut registry.
 *
 * Registers all global shortcuts in one place so they're easy to audit
 * and don't conflict with each other.
 *
 * Shortcuts:
 *   g → /guide       (TV Guide)
 *   h → /            (Home)
 *   m → /movies      (Movies)
 *   s → /series      (Series)
 *   / → /search      (Search page)
 *   ? / Shift+/ →    Toggle shortcuts overlay
 *
 * All shortcuts are gated — they don't fire when an INPUT, TEXTAREA,
 * SELECT, or contentEditable element is focused.
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const isInputFocused = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toUpperCase();
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      (el as HTMLElement).isContentEditable === true
    );
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when holding modifier keys (Cmd/Ctrl are for browser shortcuts)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Gate: don't hijack typing
      if (isInputFocused()) return;

      const key = e.key.toLowerCase();

      // ── Navigation shortcuts ──────────────────────────────
      switch (key) {
        case "g":
          e.preventDefault();
          navigate("/guide");
          return;
        case "h":
          e.preventDefault();
          navigate("/");
          return;
        case "m":
          e.preventDefault();
          navigate("/movies");
          return;
        case "s":
          e.preventDefault();
          navigate("/series");
          return;
      }

      // ── Search shortcut ───────────────────────────────────
      if (key === "/") {
        e.preventDefault();
        navigate("/search");
        return;
      }

      // ── Shortcuts overlay toggle ──────────────────────────
      // "?" (Shift+/) or Shift+/ on layouts where / needs shift
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("stv:toggle-shortcuts"));
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, isInputFocused]);
}
