import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  User,
  Film,
  Tv,
  Star,
  Calendar,
  ExternalLink,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import type { TmdbPersonInfo, TmdbPersonCredit } from "@/lib/types";

export default function PersonPage() {
  const { encodedName } = useParams<{ encodedName: string }>();
  const navigate = useNavigate();
  const name = encodedName ? decodeURIComponent(encodedName) : "";

  const [info, setInfo] = useState<TmdbPersonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve name → person detail via tmdb-enrich CLI
  useEffect(() => {
    if (!name) {
      setError("No person name provided");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api.tmdb.person
      .search(name)
      .then((resp) => {
        if (cancelled) return;
        if (!resp.enabled || !resp.info) {
          setError(`No results found for "${name}"`);
          setLoading(false);
          return;
        }
        setInfo(resp.info);
        // If the resolved name differs, update URL
        if (resp.info.name !== name) {
          window.history.replaceState(
            null,
            "",
            `/person/${encodeURIComponent(resp.info.name)}`,
          );
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not search for person");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [name]);

  // ── Derived ──────────────────────────────────────────────────────
  const credits = info?.known_for || [];
  const formatDate = (d: string | null) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return d;
    } // render error — expected with incomplete state
  };
  const age = (birthday: string | null) => {
    if (!birthday) return "";
    const b = new Date(birthday);
    const years = new Date().getFullYear() - b.getFullYear();
    return `${years} years old`;
  };
  const creditType = (c: TmdbPersonCredit) => c.type || "movie";

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

      {/* Loading */}
      {loading && (
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
      {info && (
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Photo */}
          <div className="shrink-0 w-48 h-72 rounded-xl overflow-hidden bg-muted mx-auto sm:mx-0">
            {info.image ? (
              <img
                src={info.image}
                alt={info.name}
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
            <h1 className="text-2xl font-bold">{info.name}</h1>

            {/* Quick info badges */}
            <div className="flex flex-wrap gap-3">
              {info.roles && info.roles.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                  <Star className="h-3 w-3" />
                  {info.roles.slice(0, 3).join(", ")}
                </span>
              )}
              {info.birthday && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 text-muted-foreground text-[11px]">
                  <Calendar className="h-3 w-3" />
                  {formatDate(info.birthday)} ({age(info.birthday)})
                </span>
              )}
            </div>

            {/* External links */}
            <div className="flex gap-3 pt-1">
              <a
                href={`https://www.themoviedb.org/person/${info.id}`}
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
          <h2 className="text-lg font-semibold">
            Known For
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {credits.length} titles
            </span>
          </h2>

          {/* Credit grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {credits.map((credit, idx) => {
              const title = credit.title || "";
              const poster = credit.poster || "";
              const ct = creditType(credit);

              return (
                <div
                  key={`${ct}-${credit.tmdb_id || idx}`}
                  onClick={() => {
                    if (ct === "movie") {
                      navigate(`/movies?q=${encodeURIComponent(title)}`);
                    } else {
                      navigate(`/series?q=${encodeURIComponent(title)}`);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (ct === "movie") {
                        navigate(`/movies?q=${encodeURIComponent(title)}`);
                      } else {
                        navigate(`/series?q=${encodeURIComponent(title)}`);
                      }
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${title} ${ct === "movie" ? "movie" : "series"} search`}
                  className="group flex flex-col rounded-xl overflow-hidden bg-card border border-border hover:border-primary/40 transition-all cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
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
                        {ct === "movie" ? (
                          <Film className="h-8 w-8 text-white/10" />
                        ) : (
                          <Tv className="h-8 w-8 text-white/10" />
                        )}
                      </div>
                    )}
                    {/* Media type badge */}
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-medium text-white/70">
                      {ct === "movie" ? "Movie" : "TV"}
                    </div>
                  </div>

                  {/* Title */}
                  <div className="p-2.5 space-y-0.5 flex-1">
                    <p className="text-xs font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom padding */}
      <div className="h-8" />
    </div>
  );
}
