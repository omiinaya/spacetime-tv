import { useState, useEffect, useRef, useCallback } from "react";
import { Moon, Timer } from "lucide-react";

interface SleepTimerProps {
  onPause: () => void;
}

const PRESETS = [
  { label: "30m", minutes: 30 },
  { label: "60m", minutes: 60 },
  { label: "90m", minutes: 90 },
  { label: "Off", minutes: 0 },
];

export function SleepTimer({ onPause }: SleepTimerProps) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(0); // seconds, 0 = off
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback((minutes: number) => {
    // Clear existing timer
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (minutes <= 0) {
      setRemaining(0);
      setOpen(false);
      return;
    }

    const seconds = minutes * 60;
    setRemaining(seconds);

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          // Time's up — pause playback
          onPause();
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setOpen(false);
  }, [onPause]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-white/60 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] flex items-center justify-center gap-1 ${
          remaining > 0 ? "text-purple-400" : ""
        }`}
        aria-label={remaining > 0 ? `Sleep timer: ${fmt(remaining)} remaining` : "Sleep timer"}
      >
        <Moon className="w-4 h-4" aria-hidden="true" />
        {remaining > 0 && (
          <span className="text-[9px] tabular-nums">{fmt(remaining)}</span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[7rem] shadow-xl">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => start(p.minutes)}
              className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                (p.minutes > 0 && remaining > 0 && Math.abs(remaining - p.minutes * 60) < 100)
                  ? "text-purple-400"
                  : p.minutes === 0 && remaining === 0
                  ? "text-blue-400"
                  : "text-white/70"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
