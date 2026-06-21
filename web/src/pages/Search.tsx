import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Loader2,
  Tv,
  Film,
  Tv2,
  Play,
  Star,
  AlertCircle,
} from "lucide-react";
import { api, LiveStream, Movie, Series } from "@/lib/api";

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    live: LiveStream[];
    movies: Movie[];
    series: Series[];
  } | null>(null);

  const doSearch = useCallback(async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.search(query);
      setResults(r);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [query]);

  const total =
    results
      ? results.live.length + results.movies.length + results.series.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Search className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Search</h1>
          <p className="text-sm text-muted-foreground">
            Search across {total > 0 ? total.toLocaleString() : "all"} content
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder="Search channels, movies, series..."
          className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          autoFocus
        />
        <button
          onClick={doSearch}
          disabled={loading || query.trim().length < 2}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Search"
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-8">
          {/* Live */}
          {results.live.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Tv className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  Live TV ({results.live.length})
                </h2>
              </div>
              <div className="channel-grid">
                {results.live.map((s) => (
                  <button
                    key={s.stream_id}
                    onClick={() => navigate(`/watch/live/${s.stream_id}`)}
                    className="channel-card bg-card rounded-lg border border-border p-3 text-left hover:border-primary/30"
                  >
                    <p className="text-xs font-medium leading-tight line-clamp-2">
                      {s.name}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Movies */}
          {results.movies.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Film className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  Movies ({results.movies.length})
                </h2>
              </div>
              <div className="poster-grid">
                {results.movies.map((m) => (
                  <button
                    key={m.stream_id}
                    onClick={() => navigate(`/watch/movie/${m.stream_id}`)}
                    className="group bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-all"
                  >
                    <div className="aspect-[2/3] bg-muted relative overflow-hidden">
                      {m.stream_icon ? (
                        <img
                          src={m.stream_icon}
                          alt=""
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-medium line-clamp-2 leading-tight">
                        {m.name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Series */}
          {results.series.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Tv2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  Series ({results.series.length})
                </h2>
              </div>
              <div className="poster-grid">
                {results.series.map((s) => (
                  <div
                    key={s.series_id}
                    className="bg-card rounded-lg border border-border overflow-hidden"
                  >
                    <div className="aspect-[2/3] bg-muted">
                      {s.cover ? (
                        <img
                          src={s.cover}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Tv2 className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-medium line-clamp-2 leading-tight">
                        {s.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {total === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No results for &quot;{query}&quot;</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!results && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            Search across all live TV channels, movies, and series
          </p>
        </div>
      )}
    </div>
  );
}
