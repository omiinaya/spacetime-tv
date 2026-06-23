import { useEffect } from "react";

/** POST an error to the backend beacon. */
async function beaconError(error: {
  message: string;
  stack?: string;
  componentStack?: string;
}) {
  try {
    await fetch("/api/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack ?? "",
        componentStack: error.componentStack ?? "",
        url: window.location.href,
      }),
    });
  } catch {
    // fire-and-forget — don't loop if beacon itself fails
  }
}

/**
 * Catches unhandled errors and unhandled promise rejections
 * and POSTs them to the backend error beacon.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      beaconError({
        message: event.message || "Unknown error",
        stack: event.error?.stack ?? "",
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      beaconError({
        message,
        stack:
          reason instanceof Error ? reason.stack ?? "" : String(reason),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null; // invisible component
}

/**
 * Call this from ErrorBoundary.componentDidCatch to also beacon
 * React render-tree errors.
 */
export function reportRenderError(error: Error, componentStack: string) {
  beaconError({
    message: error.message,
    stack: error.stack ?? "",
    componentStack,
  });
}
