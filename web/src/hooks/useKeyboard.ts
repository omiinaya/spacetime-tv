import { useEffect } from "react";

interface KeyboardCallbacks {
  togglePlay: () => void;
  seek: (seconds: number) => void;
  toggleFullscreen: () => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  volume: number;
}

/**
 * Global keyboard shortcuts for the player.
 * Space/k = play/pause, arrows/j/l = seek ±10s, f = fullscreen, m = mute, up/down = volume.
 * Skips when focused on input/textarea elements.
 */
export function useKeyboard(callbacks: KeyboardCallbacks) {
  const { togglePlay, seek, toggleFullscreen, toggleMute, setVolume, volume } =
    callbacks;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case "j":
          e.preventDefault();
          seek(-10);
          break;
        case "ArrowRight":
        case "l":
          e.preventDefault();
          seek(10);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          toggleMute();
          break;
        case "ArrowUp":
          setVolume(Math.min(1, volume + 0.1));
          break;
        case "ArrowDown":
          setVolume(Math.max(0, volume - 0.1));
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, seek, toggleFullscreen, toggleMute, setVolume, volume]);
}
