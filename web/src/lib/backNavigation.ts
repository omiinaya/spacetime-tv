/**
 * Back-navigation tracking.
 *
 * Saves the last non-player route to sessionStorage so the player's Back
 * button can return to the page the user came from (instead of the browser
 * history stack, which gets polluted by /watch/ URLs).
 */
const BACK_KEY = "stv_back_url";

export function saveBackPath(path: string) {
  try {
    sessionStorage.setItem(BACK_KEY, path);
  } catch {
    // DOMException: storage quota or unavailable
  }
}

export function getBackPath(): string | null {
  try {
    return sessionStorage.getItem(BACK_KEY);
  } catch {
    return null;
  }
}

// Intercept all clicks that navigate to /watch/ routes and save the
// current URL BEFORE the navigation happens.
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>("[data-watch-link]");
      if (btn) {
        saveBackPath(window.location.pathname + window.location.search);
      }
    },
    true,
  );
}
