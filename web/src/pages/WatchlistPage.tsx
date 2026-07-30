import { useState } from "react";
import { Heart, Tv2 } from "lucide-react";
import { getWatchlist, getSeriesWatchlist } from "@/lib/watchlist";
import WatchlistMoviesTab from "@/components/WatchlistMoviesTab";
import WatchlistSeriesTab from "@/components/WatchlistSeriesTab";

type Tab = "movies" | "series";

export default function WatchlistPage() {
  const [tab, setTab] = useState<Tab>("movies");

  return (
    <div>
      {/* Header */}
      <div className="page-header mb-6 sm:mb-8">
        <div className="page-header-icon">
          <Heart className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold">My Watchlist</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 sm:mb-8 border-b border-border">
        <button
          onClick={() => setTab("movies")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            tab === "movies"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Heart
            className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5"
            aria-hidden="true"
          />
          Movies ({getWatchlist().length})
        </button>
        <button
          onClick={() => setTab("series")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            tab === "series"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Tv2
            className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5"
            aria-hidden="true"
          />
          Series ({getSeriesWatchlist().length})
        </button>
      </div>

      {tab === "movies" ? <WatchlistMoviesTab /> : <WatchlistSeriesTab />}
    </div>
  );
}
