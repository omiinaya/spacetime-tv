import { useCallback } from "react";

interface PlayerProgressBarProps {
  isLive: boolean;
  isVod: boolean;
  liveSeekableStart: number;
  liveSeekableEnd: number;
  currentTime: number;
  duration: number;
  buffered: number;
  progressPct: number;
  bufferedPct: number;
  secondsBehindLive: number;
  onSeekTo: (time: number) => void;
  onShowControls: (temporary?: boolean) => void;
  fmtTime: (t: number) => string;
}

export default function PlayerProgressBar({
  isLive, isVod, liveSeekableStart, liveSeekableEnd,
  currentTime, duration, buffered, progressPct, bufferedPct,
  secondsBehindLive, onSeekTo, onShowControls, fmtTime,
}: PlayerProgressBarProps) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (isLive) {
      const seekRange = liveSeekableEnd - liveSeekableStart;
      if (seekRange > 0) {
        onSeekTo(liveSeekableStart + fraction * seekRange);
      }
    } else if (duration) {
      onSeekTo(fraction * duration);
    }
    onShowControls(true);
  }, [isLive, liveSeekableStart, liveSeekableEnd, duration, onSeekTo, onShowControls]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const fraction = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    if (isLive) {
      const seekRange = liveSeekableEnd - liveSeekableStart;
      if (seekRange > 0) {
        onSeekTo(liveSeekableStart + fraction * seekRange);
      }
    } else if (duration) {
      onSeekTo(fraction * duration);
    }
    onShowControls(true);
  }, [isLive, liveSeekableStart, liveSeekableEnd, duration, onSeekTo, onShowControls]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const fraction = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    if (isLive) {
      const seekRange = liveSeekableEnd - liveSeekableStart;
      if (seekRange > 0) {
        onSeekTo(liveSeekableStart + fraction * seekRange);
      }
    } else if (duration) {
      onSeekTo(fraction * duration);
    }
  }, [isLive, liveSeekableStart, liveSeekableEnd, duration, onSeekTo]);

  // Only show timeline for VOD, or Live when there's a DVR buffer
  if (!isVod && !(isLive && liveSeekableEnd > 0)) {
    return null;
  }

  return (
    <div
      className="relative w-full cursor-pointer group/progress mb-3 sm:mb-3"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      role="slider"
      aria-label="Seek"
      aria-valuemin={isLive ? liveSeekableStart : 0}
      aria-valuemax={isLive ? liveSeekableEnd : duration}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={isLive
        ? `${Math.round(secondsBehindLive)}s behind live`
        : `${fmtTime(currentTime)} of ${fmtTime(duration)}`
      }
      tabIndex={0}
    >
      <div className="absolute inset-x-0 -top-2 -bottom-2" />
      <div className="relative w-full h-1.5 sm:h-1 bg-white/20 rounded">
        <div className="absolute inset-y-0 left-0 bg-white/30 rounded" style={{ width: `${bufferedPct}%` }} />
        <div className="absolute inset-y-0 left-0 bg-blue-500 rounded" style={{ width: `${progressPct}%` }}>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-3 sm:h-3 bg-blue-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  );
}
