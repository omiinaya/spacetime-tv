import { Tv2 } from "lucide-react";

interface SeriesHeaderProps {
  categoryCount: number;
}
export default function SeriesHeader({ categoryCount }: SeriesHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-icon">
        <Tv2 className="h-5 w-5 text-primary" />
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
