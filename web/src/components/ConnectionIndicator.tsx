interface ConnectionIndicatorProps {
  connectionQuality: string;
  downloadSpeed: number;
  stallCount: number;
}

export default function ConnectionIndicator({
  connectionQuality,
  downloadSpeed,
  stallCount,
}: ConnectionIndicatorProps) {
  const level =
    connectionQuality === "excellent"
      ? 4
      : connectionQuality === "good"
        ? 3
        : connectionQuality === "fair"
          ? 2
          : 1;

  return (
    <span
      className="inline-flex items-center gap-[2px] ml-1.5 align-middle"
      title={`Connection: ${connectionQuality}${downloadSpeed > 0 ? ` (${Math.round(downloadSpeed)} KB/s)` : ""}${stallCount > 0 ? `, ${stallCount} stall(s)` : ""}`}
      aria-label={`Connection quality: ${connectionQuality}`}
    >
      {[0, 1, 2, 3].map((i) => {
        const active = i < level;
        const color =
          connectionQuality === "poor"
            ? "bg-red-500"
            : connectionQuality === "fair"
              ? "bg-yellow-400"
              : "bg-green-500";
        return (
          <span
            key={i}
            className={`block w-[3px] rounded-sm transition-all duration-300 ${
              active ? color : "bg-white/15"
            }`}
            style={{ height: `${4 + i * 3}px` }}
          />
        );
      })}
    </span>
  );
}
