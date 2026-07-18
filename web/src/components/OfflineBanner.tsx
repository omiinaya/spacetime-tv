import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

/**
 * OfflineBanner — shows a persistent banner when the browser reports
 * that the device has no network connectivity. Auto-hides when back online.
 *
 * Uses navigator.onLine and online/offline window events for reliable
 * detection across browsers.
 *
 * @param {Object} props
 * @param {boolean} [props.showAlways] — If true, shows the banner even when online (for testing)
 */
export default function OfflineBanner({
  showAlways = false,
}: {
  showAlways?: boolean;
}) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Set initial state from navigator.onLine
    setOffline(typeof navigator !== "undefined" && !navigator.onLine);

    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline && !showAlways) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600/90 backdrop-blur-sm shadow-lg"
    >
      {offline ? (
        <>
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>You are offline. Some features may be unavailable.</span>
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Back online — showing cached content where available.</span>
        </>
      )}
    </div>
  );
}
