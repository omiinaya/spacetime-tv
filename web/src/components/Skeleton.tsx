// Reusable skeleton primitives with pulse animation
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded bg-muted ${className}`}
      style={style}
    />
  );
}

export function SkeletonLine({
  width = "100%",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return (
    <Skeleton
      className={`h-3 ${className}`}
      style={{ width }}
    />
  );
}

export function SkeletonBlock({
  className = "",
}: {
  className?: string;
}) {
  return <Skeleton className={`aspect-square ${className}`} />;
}

// Channel card skeleton
export function ChannelCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border p-3">
      <Skeleton className="w-full h-12 mb-2" />
      <SkeletonLine width="75%" />
    </div>
  );
}

// Poster card skeleton (movies/series)
export function PosterCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <Skeleton className="aspect-[2/3] w-full rounded-none" />
      <div className="p-2.5 space-y-1.5">
        <SkeletonLine width="85%" />
        <SkeletonLine width="45%" />
      </div>
    </div>
  );
}

// Series card skeleton (with episodes button area)
export function SeriesCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <Skeleton className="aspect-[2/3] w-full rounded-none" />
      <div className="p-2.5 space-y-1.5">
        <SkeletonLine width="80%" />
        <SkeletonLine width="40%" />
        <Skeleton className="w-full h-7 mt-2" />
      </div>
    </div>
  );
}

// Category tab skeleton
export function TabSkeleton() {
  return <Skeleton className="w-20 h-7 shrink-0" />;
}
