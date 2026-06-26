import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  User,
  Film,
  Tv,
  Star,
  Calendar,
  MapPin,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Search,
} from "lucide-react";
import {
  api,
  type TmdbPersonDetails,
  type TmdbPersonCredit,
} from "@/lib/api";

const TMDB_IMG = "https://image.tmdb.org/t/p";

export default function PersonPage() {
  const { encodedName } = useParams<{ encodedName: string }>();
  const navigate = useNavigate();
  const name = encodedName ? decodeURIComponent(encodedName) : "";

  // ── State ──────────────────────────────────────────────────────
  const [personId, setPersonId] = useState<number | null>(null);
  const [details, setDetails] = useState<TmdbPersonDetails | null>(null);
  const [credits, setCredits] = useState<TmdbPersonCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creditFilter, setCreditFilter] = useState<"all" | "movie" | "tv">("all");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState<
    { id: number; name: string; profile_path: string | null; known_for_department: string }[]
  >([]);

  // ── Resolve name → Person ID ────────────────────────────────────
  useEffect(() => {
    if (!name) {
      setError("No person name provided");
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Search TMDB for the person
    api.tmdb.person.search(name).then((resp) => {
      if (cancelled) return;

      if (!resp.enabled || resp.results.length === 0) {
        setError(`No results found for "${name}"`);
        setLoading(false);
        return;
      }

      const results = resp.results;
      // Pick the best match (exact name match first, else top by popularity)
      let bestMatch = results.find(
        (r) => r.name.toLowerCase() === name.toLowerCase()
      );
      if (!bestMatch) bestMatch = results[0];

      // If there are multiple ambiguous results, show a picker
      if (results.length > 1 && !bestMatch) {
        setSearchResults(
          results.slice(0, 5).map((r) => ({
            id: r.id,
            name: r.name,
            profile_path: r.profile_path,
            known_for_department: r.known_for_department,
          }))
        );
        setShowSearchResults(true);
      }

      setPersonId(bestMatch.id);
      // If the name doesn't exactly match, store the resolved name
      if (bestMatch.name !== name) {
        window.history.replaceState(null, "", `/person/${encodeURIComponent(bestMatch.name)}`);
      }
    }).catch(() => {
      if (!cancelled) {
        setError("Could not search for person");
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [name]);

  // ── Fetch details + credits ─────────────────────────────────────
  useEffect(() => {
    if (!personId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.tmdb.person.details(personId),
      api.tmdb.person.credits(personId),
    ])
      .then(([detailsResp, creditsResp]) => {
        if (cancelled) return;

        if (!detailsResp.enabled) {
          setError("TMDB API is not configured");
          setLoading(false);
          return;
        }

        setDetails(detailsResp.info);
        if (creditsResp.enabled && creditsResp.credits) {
          // Combine cast + crew, deduplicate by movie/TV id, sort by popularity
          const seen = new Set<number>();
          const all: TmdbPersonCredit[] = [];
          for (const c of [...creditsResp.credits.cast, ...creditsResp.credits.crew]) {
            if (!seen.has(c.id)) {
              seen.add(c.id);
              all.push(c);
            }
          }
          all.sort((a, b) => b.popularity - a.popularity);
          setCredits(all);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load person details");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [personId]);

  // ── Filters ─────────────────────────────────────────────────────
  const filteredCredits = credits.filter((c) => {
    if (creditFilter === "all") return true;
    return c.media_type === creditFilter;
  });

  const handleSelectPerson = useCallback((id: number, name: string) => {
    setShowSearchResults(false);
    setPersonId(id);
    window.history.replaceState(null, "", `/person/${encodeURIComponent(name)}`);
  }, []);

  // ── Format helpers ──────────────────────────────────────────────
  const formatDate = (d: string | null) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      });
    } catch {
      return d;
    }
  };

  const age = (birthday: string | null, deathday: string | null) => {
    if (!birthday) return "";
    const b = new Date(birthday);
    const e = deathday ? new Date(deathday) : new Date();
    const years = e.getFullYear() - b.getFullYear();
    return `${years} years old`;
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      {/* Search disambiguation */}
      {showSearchResults && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Multiple matches for "{name}"
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => handleSelectPerson(r.id, r.name)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                  {r.profile_path ? (
                    <img
                      src={`${TMDB_IMG}/w185${r.profile_path}`}
                      alt={r.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-5 w-5 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">{r.known_for_department}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !details && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Go back
          </button>
        </div>
      )}

      {/* Person header */}
      {details && (
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Photo */}
          <div className="shrink-0 w-48 h-72 rounded-xl overflow-hidden bg-muted mx-auto sm:mx-0">
            {details.profile_path ? (
              <img
                src={`${TMDB_IMG}/w342${details.profile_path}`}
                alt={details.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="h-12 w-12 text-muted-foreground/20" />
              </div>
            )}
          </div>

          {/* Bio */}
          <div className="flex-1 min-w-0 space-y-3">
            <h1 className="text-2xl font-bold">{details.name}</h1>

            {/* Quick info badges */}
            <div className="flex flex-wrap gap-3">
              {details.known_for_department && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                  <Star className="h-3 w-3" />
                  {details.known_for_department}
                </span>
              )}
              {details.birthday && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-muted-foreground text-[11px]">
                  <Calendar className="h-3 w-3" />
                  {formatDate(details.birthday)}
                  {details.deathday ? ` — ${formatDate(details.deathday)}` : ` (${age(details.birthday, details.deathday)})`}
                </span>
              )}
              {details.place_of_birth && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-muted-foreground text-[11px]">
                  <MapPin className="h-3 w-3" />
                  {details.place_of_birth}
                </span>
              )}
            </div>

            {/* Biography */}
            {details.biography ? (
              <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
                {details.biography.split("\n\n").map((p, i) => (
                  <p key={i} className={i > 2 ? "hidden" : ""}>
                    {p}
                  </p>
                ))}
                {details.biography.split("\n\n").length > 3 && (
                  <button
                    onClick={() => {
                      const el = document.getElementById("full-bio");
                      if (el) el.classList.toggle("hidden");
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Read more
                  </button>
                )}
                <div id="full-bio" className="hidden">
                  {details.biography.split("\n\n").slice(3).map((p, i) => (
                    <p key={i + 3} className="mt-2">{p}</p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">No biography available</p>
            )}

            {/* External links */}
            <div className="flex gap-3 pt-1">
              {details.imdb_id && (
                <a
                  href={`https://www.imdb.com/name/${details.imdb_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  IMDb
                </a>
              )}
              <a
                href={`https://www.themoviedb.org/person/${details.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                TMDB
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Filmography */}
      {credits.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Filmography
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {filteredCredits.length} titles
              </span>
            </h2>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-0.5">
              {(["all", "movie", "tv"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setCreditFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                    creditFilter === f
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "movie" ? (
                    <span className="flex items-center gap-1"><Film className="h-3 w-3" />Movies</span>
                  ) : f === "tv" ? (
                    <span className="flex items-center gap-1"><Tv className="h-3 w-3" />TV</span>
                  ) : (
                    "All"
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Credit grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredCredits.map((credit) => {
              const title = credit.title || credit.name || "";
              const year = (credit.release_date || credit.first_air_date || "").slice(0, 4);
              const poster = credit.poster_path
                ? `${TMDB_IMG}/w342${credit.poster_path}`
                : "";

              return (
                <div
                  key={`${credit.media_type}-${credit.id}-${credit.credit_id}`}
                  onClick={() => {
                    if (credit.media_type === "movie") {
                      navigate(`/movies?q=${encodeURIComponent(title)}`);
                    } else {
                      navigate(`/series?q=${encodeURIComponent(title)}`);
                    }
                  }}
                  className="group flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-all cursor-pointer"
                >
                  {/* Poster */}
                  <div className="relative aspect-[2/3] bg-muted overflow-hidden">
                    {poster ? (
                      <img
                        src={poster}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#141420]">
                        {credit.media_type === "movie" ? (
                          <Film className="h-8 w-8 text-white/10" />
                        ) : (
                          <Tv className="h-8 w-8 text-white/10" />
                        )}
                      </div>
                    )}
                    {/* Media type badge */}
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                      {credit.media_type === "movie" ? "Movie" : "TV"}
                    </div>
                    {/* Rating */}
                    {credit.vote_average > 0 && (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-semibold text-yellow-400 flex items-center gap-0.5">
                        <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                        {credit.vote_average.toFixed(1)}
                      </div>
                    )}
                    {/* Character/role badge */}
                    {credit.character && (
                      <div className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                        <p className="text-[10px] font-medium text-white/80 truncate">
                          {credit.character}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Title + year */}
                  <div className="p-2.5 space-y-0.5 flex-1">
                    <p className="text-xs font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {title}
                    </p>
                    {year && (
                      <p className="text-[10px] text-muted-foreground">{year}</p>
                    )}
                    {credit.job && (
                      <p className="text-[10px] text-muted-foreground italic">{credit.job}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty state after filtering */}
          {filteredCredits.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Film className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">
                No {creditFilter} credits found
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
