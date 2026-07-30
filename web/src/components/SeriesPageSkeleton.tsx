import { Skeleton, PosterCardSkeleton } from "@/components/Skeleton";

export default function SeriesPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="w-24 h-5" />
          <Skeleton className="w-40 h-3.5" />
        </div>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="w-48 h-4" />
          <div className="flex gap-2">
            {Array.from({ length: 7 }).map((_, j) => (
              <div key={j} className="shrink-0 w-[170px] sm:w-[185px]">
                <PosterCardSkeleton />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
