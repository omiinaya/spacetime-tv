import { useEffect, useState, useCallback, useRef } from "react";
import { X, Search, Play, SkipBack, SkipForward, Maximize, VolumeX, ChevronUp, ChevronDown, Keyboard } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface Shortcut {
  key: string;
  label: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  // Global
  { key: "g", label: "Go to TV Guide", category: "Global" },
  { key: "h", label: "Go to Home", category: "Global" },
  { key: "m", label: "Go to Movies", category: "Global" },
  { key: "s", label: "Go to Series", category: "Global" },
  { key: "/", label: "Search", category: "Global" },
  { key: "?", label: "Show keyboard shortcuts", category: "Global" },
  // Player
  { key: "Space / k", label: "Play / Pause", category: "Player" },
  { key: "← / j", label: "Seek back 10s", category: "Player" },
  { key: "→ / l", label: "Seek forward 10s", category: "Player" },
  { key: "f", label: "Toggle fullscreen", category: "Player" },
  { key: "m", label: "Toggle mute", category: "Player" },
  { key: "↑", label: "Volume up", category: "Player" },
  { key: "↓", label: "Volume down", category: "Player" },
];

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  // Listen for custom event from the global shortcut hook
  useEffect(() => {
    const onCustomToggle = () => toggle();
    window.addEventListener("stv:toggle-shortcuts", onCustomToggle);
    return () => {
      window.removeEventListener("stv:toggle-shortcuts", onCustomToggle);
    };
  }, [toggle]);

  // Close on Escape when overlay is open
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  if (!open) return null;

  const categories = [...new Set(SHORTCUTS.map((s) => s.category))];

  const iconForKey = (key: string) => {
    if (key.includes("Space")) return <Play className="h-3 w-3" />;
    if (key.includes("←")) return <SkipBack className="h-3 w-3" />;
    if (key.includes("→")) return <SkipForward className="h-3 w-3" />;
    if (key === "f") return <Maximize className="h-3 w-3" />;
    if (key === "m") return <VolumeX className="h-3 w-3" />;
    if (key === "↑") return <ChevronUp className="h-3 w-3" />;
    if (key === "↓") return <ChevronDown className="h-3 w-3" />;
    if (key === "/") return <Search className="h-3 w-3" />;
    if (key === "?") return <Keyboard className="h-3 w-3" />;
    return null;
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="bg-[#0d0d1a] border border-white/10 rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Keyboard className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold text-white">Keyboard Shortcuts</span>
          </div>
          <button
            onClick={close}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Shortcuts */}
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {categories.map((cat) => (
            <div key={cat}>
              <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2.5">
                {cat}
              </h3>
              <div className="space-y-1">
                {SHORTCUTS.filter((s) => s.category === cat).map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-white/60">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {iconForKey(s.key) && (
                        <span className="text-white/30">{iconForKey(s.key)}</span>
                      )}
                      <kbd className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-white/80">
                        {s.key}
                      </kbd>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 text-center">
          <p className="text-[11px] text-white/20">
            Press <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] font-mono">?</kbd> to toggle
          </p>
        </div>
      </div>
    </div>
  );
}
