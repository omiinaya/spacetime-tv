import { useState, useEffect } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// MSStream is a non-standard IE/Edge property on window (falsy on real iOS Safari)
interface WindowWithMSStream extends Window {
  MSStream?: unknown;
}

/**
 * Handles the PWA install prompt (beforeinstallprompt event).
 * Shows a banner when the app is installable.
 */
export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if user dismissed recently
    try {
      const ts = localStorage.getItem("stv_pwa_dismissed");
      if (ts && Date.now() - parseInt(ts) < 7 * 86400_000) {
        return; // dismissed within a week
      }
    } catch {}

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Also show for iOS (no beforeinstallprompt event)
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as WindowWithMSStream).MSStream;
    if (isIOS && !window.matchMedia("(display-mode: standalone)").matches) {
      // Show after a short delay to avoid competing with page load
      setTimeout(() => setShowPrompt(true), 5000);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // iOS fallback: show instructions
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    try {
      localStorage.setItem("stv_pwa_dismissed", String(Date.now()));
    } catch {}
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-80 z-50">
      <div className="bg-card border border-border rounded-xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Install Spacetime-TV</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add to your home screen for quick access
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
