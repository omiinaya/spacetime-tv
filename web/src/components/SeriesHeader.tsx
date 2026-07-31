import { Tv2 } from "lucide-react";

interface SeriesHeaderProps {
  categoryCount: number;
}
export default function SeriesHeader({ categoryCount }: SeriesHeaderProps) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Tv2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
      </div>
      <div>
        <h1 className="text-lg sm:text-xl font-semibold">Series</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {categoryCount > 0
            ? `${categoryCount.toLocaleString()} categories`
            : ""}
        </p>
      </div>
    </div>
  );
}
