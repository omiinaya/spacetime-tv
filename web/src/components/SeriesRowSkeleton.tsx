import { PosterCardSkeleton } from "@/components/Skeleton";
import { Skeleton } from "@/components/Skeleton";

export default function SeriesRowSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 px-1">
        <Skeleton className="w-40 h-4" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }).map((_, j) => (
          <div key={j} className="shrink-0 w-[170px] sm:w-[185px]">
            <PosterCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}
