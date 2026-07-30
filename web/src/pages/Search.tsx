import { Search, AlertCircle } from "lucide-react";
import useSearchPage from "@/hooks/useSearchPage";
import SearchHeader from "@/components/SearchHeader";
import SearchFilterBar from "@/components/SearchFilterBar";
import LiveSearchResults from "@/components/LiveSearchResults";
import MovieSearchResults from "@/components/MovieSearchResults";
import SeriesSearchResults from "@/components/SeriesSearchResults";
import EpgSearchResults from "@/components/EpgSearchResults";

export default function SearchPage() {
  const {
    query,
    loading,
    error,
    results,
    totals,
    enrichData,
    epgResults,
    epgLoading,
    showHistory,
    filter,
    sortBy,
    loadingMore,
    total,
    liveCount,
    movieCount,
    seriesCount,
    filteredResults,
    filteredTotal,
    getNowPlaying,
    handleQueryChange,
    doSearch,
    doClear,
    handleHistorySelect,
    setShowHistory,
    setFilter,
    setSortBy,
    loadMore,
  } = useSearchPage();

  return (
    <div className="space-y-6">
      <SearchHeader
        query={query}
        loading={loading}
        showHistory={showHistory}
        onQueryChange={handleQueryChange}
        onSearch={doSearch}
        onClear={doClear}
        onFocus={() => {
          if (!query) setShowHistory(true);
        }}
        onHistorySelect={handleHistorySelect}
        onHistoryClose={() => setShowHistory(false)}
        resultCount={filteredTotal > 0 ? filteredTotal : undefined}
        totalCount={total > 0 ? total : undefined}
        activeFilter={filter !== "all" ? filter : undefined}
      />

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {results && (
        <SearchFilterBar
          filter={filter}
          sortBy={sortBy}
          onFilterChange={setFilter}
          onSortChange={setSortBy}
          total={total}
          liveCount={liveCount}
          movieCount={movieCount}
          seriesCount={seriesCount}
          epgCount={epgResults?.length ?? 0}
        />
      )}

      {filter === "epg" ? (
        <EpgSearchResults
          results={epgResults}
          loading={epgLoading}
          query={query}
        />
      ) : (
        filteredResults && (
          <div className="space-y-8">
            <LiveSearchResults
              streams={filteredResults.live}
              totalCount={totals?.live ?? 0}
              loadingMore={loadingMore === "live"}
              onLoadMore={() => loadMore("live")}
              showLoadMore={filter === "all" || filter === "live"}
              getNowPlaying={getNowPlaying}
            />

            <MovieSearchResults
              movies={filteredResults.movies}
              enrichData={enrichData}
              totalCount={totals?.movies ?? 0}
              loadingMore={loadingMore === "movies"}
              onLoadMore={() => loadMore("movies")}
              showLoadMore={filter === "all" || filter === "movies"}
            />

            <SeriesSearchResults
              series={filteredResults.series}
              enrichData={enrichData}
              totalCount={totals?.series ?? 0}
              loadingMore={loadingMore === "series"}
              onLoadMore={() => loadMore("series")}
              showLoadMore={filter === "all" || filter === "series"}
            />

            {total > 0 && filteredTotal === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No results for &quot;{query}&quot; in this category
                </p>
              </div>
            )}
          </div>
        )
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
