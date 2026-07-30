import { Tv2 } from "lucide-react";

interface SeriesHeaderProps {
  categoryCount: number;
}
export default function SeriesHeader({ categoryCount }: SeriesHeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Tv2 className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">Series</h1>
        <p className="text-sm text-muted-foreground">
          {categoryCount > 0
            ? `${categoryCount.toLocaleString()} categories`
            : ""}
        </p>
      </div>
    </div>
  );
}
