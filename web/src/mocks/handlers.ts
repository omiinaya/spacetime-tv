/**
 * MSW (Mock Service Worker) request handlers for API-level integration tests.
 *
 * These intercept actual fetch calls at the network layer so tests can exercise
 * the real `api` module without relying on `vi.mock("@/lib/api")`.
 *
 * ── Usage ─────────────────────────────────────────────────────────
 *
 *   import { http, HttpResponse } from "msw";
 *   import { handlers } from "@/mocks/handlers";
 *
 *   // In a test file:
 *   // Instead of vi.mock("@/lib/api", ...), simply use the MSW handlers.
 *   // The real api.ts module will make fetch() calls that MSW intercepts.
 */

import { http, HttpResponse } from "msw";

const API = "/api";

// ── Fixture data ─────────────────────────────────────────────────

export const sampleCategories: import("@/lib/api").Category[] = [
  { category_id: "1", category_name: "Action", parent_id: 0 },
  { category_id: "2", category_name: "Drama", parent_id: 0 },
];

export const sampleSeries: import("@/lib/api").Series[] = [
  {
    num: 1,
    name: "Breaking Bad",
    series_id: 101,
    cover: "https://example.com/bb.jpg",
    plot: "A high school teacher turns to meth production.",
    cast: "Bryan Cranston, Aaron Paul",
    director: "Vince Gilligan",
    genre: "Crime, Drama, Thriller",
    releaseDate: "2008-01-20",
    rating: "9.5",
    rating_5based: "4.7",
    tmdb: "1396",
    youtube_trailer: "",
    category_id: "2",
  },
  {
    num: 2,
    name: "Stranger Things",
    series_id: 102,
    cover: "",
    plot: "Kids discover supernatural secrets.",
    cast: "Winona Ryder, David Harbour",
    director: "Duffer Brothers",
    genre: "Sci-Fi, Horror",
    releaseDate: "2016-07-15",
    rating: "8.7",
    rating_5based: "4.3",
    tmdb: "66732",
    youtube_trailer: "",
    category_id: "1",
  },
  {
    num: 3,
    name: "The Office",
    series_id: 103,
    cover: "https://example.com/office.jpg",
    plot: "A mockumentary about office workers.",
    cast: "Steve Carell, Rainn Wilson",
    director: "Greg Daniels",
    genre: "Comedy",
    releaseDate: "",
    rating: "",
    rating_5based: "",
    tmdb: "2316",
    youtube_trailer: "",
    category_id: "1",
  },
];

export const sampleMovies: import("@/lib/api").UnifiedMovie[] = [
  {
    num: 1,
    name: "The Matrix",
    stream_id: 201,
    stream_icon: "https://example.com/matrix.jpg",
    rating: "8.7",
    rating_5based: 4.3,
    tmdb: "603",
    category_id: "1",
    container_extension: "mp4",
    base_name: "The Matrix",
    languages: [
      { code: "en", name: "English", stream_id: 201, container_extension: "mp4" },
    ],
    language_count: 1,
    added: "2024-01-01",
  },
  {
    num: 2,
    name: "Inception",
    stream_id: 202,
    stream_icon: "",
    rating: "8.8",
    rating_5based: 4.4,
    tmdb: "27205",
    category_id: "1",
    container_extension: "mkv",
    base_name: "Inception",
    languages: [
      { code: "en", name: "English", stream_id: 202, container_extension: "mkv" },
      { code: "fr", name: "French", stream_id: 203, container_extension: "mkv" },
    ],
    language_count: 2,
    added: "2024-01-02",
  },
];

export const sampleLiveStreams: import("@/lib/api").LiveStream[] = [
  { num: 1, name: "CNN", stream_type: "live", stream_id: 301, stream_icon: "https://example.com/cnn.png", epg_channel_id: "CNN.us", category_id: "1", tv_archive: 1, tv_archive_duration: 168 },
  { num: 2, name: "BBC World", stream_type: "live", stream_id: 302, stream_icon: "", epg_channel_id: "BBCW.us", category_id: "2", tv_archive: 0, tv_archive_duration: 0 },
];

export const sampleChannelGroups: import("@/lib/api").ChannelGroup[] = [
  {
    channel_id: "CNN.us",
    channel_name: "CNN",
    channel_icon: "https://example.com/cnn.png",
    stream_id: 301,
    programmes: [
      { start: "2026-06-27 06:00", stop: "2026-06-27 07:00", title: "Morning News", subtitle: "", desc: "Morning news coverage", category: "news", is_live: true },
    ],
  },
];

export const sampleTrending: Record<string, unknown>[] = [
  { id: 1396, name: "Breaking Bad", poster_path: "/bb.jpg", vote_average: 9.5, first_air_date: "2008-01-20" },
];

// ── Handlers ─────────────────────────────────────────────────────
// Each handler matches a specific API path and returns fixture data.

export const handlers = [
  // ── Series ──────────────────────────────────────────────────
  http.get(`${API}/series/categories`, () =>
    HttpResponse.json({ categories: sampleCategories }),
  ),

  http.get(`${API}/series`, ({ request }) => {
    const url = new URL(request.url);
    const catId = url.searchParams.get("category_id") || "";
    const filtered = sampleSeries.filter((s) => s.category_id === catId);
    return HttpResponse.json({ series: filtered, total: filtered.length, offset: 0, limit: 20 });
  }),

  http.get(`${API}/series/:id`, ({ params }) => {
    const series = sampleSeries.find((s) => s.series_id === Number(params.id));
    if (!series) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({
      seasons: [
        {
          name: "Season 1",
          episode_count: "3",
          overview: "First season",
          air_date: "2008-01-20",
          cover: "",
          cover_tmdb: "",
          season_number: 1,
          cover_big: "",
          releaseDate: "2008-01-20",
          duration: "45 min",
        },
      ],
      info: {
        name: series.name,
        cover: series.cover,
        plot: series.plot,
        cast: series.cast,
        director: series.director,
        genre: series.genre,
        releaseDate: series.releaseDate,
        release_date: series.releaseDate,
        last_modified: "",
        rating: series.rating,
        rating_5based: series.rating_5based,
        backdrop_path: [],
        tmdb: series.tmdb,
        youtube_trailer: series.youtube_trailer,
        episode_run_time: "",
        category_id: series.category_id,
        category_ids: [Number(series.category_id)],
      },
      episodes: {
        "1": [
          {
            id: `${series.series_id}-1-1`,
            episode_num: 1,
            title: "Pilot",
            container_extension: "mp4",
            info: {
              air_date: "2008-01-20",
              rating: 9.5,
              id: 1,
              duration_secs: 3600,
              movie_image: series.cover,
              plot: "The beginning.",
              release_date: "2008-01-20",
              season: 1,
            },
          },
        ],
      },
    });
  }),

  // ── Movies ──────────────────────────────────────────────────
  http.get(`${API}/movies/categories`, () =>
    HttpResponse.json({ categories: sampleCategories }),
  ),

  http.get(`${API}/movies/unified`, ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    let results = sampleMovies;
    if (q) {
      results = sampleMovies.filter((m) =>
        m.name.toLowerCase().includes(q.toLowerCase()),
      );
    }
    return HttpResponse.json({ movies: results, total: results.length, offset: 0, limit: 50 });
  }),

  http.get(`${API}/movies/:id`, ({ params }) => {
    const movie = sampleMovies.find((m) => m.stream_id === Number(params.id));
    if (!movie) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({
      info: {
        name: movie.name,
        plot: "A thrilling story.",
        cast: "Actor One, Actor Two",
        director: "Director Name",
        genre: "Action, Sci-Fi",
        rating: movie.rating,
        releasedate: "1999-03-31",
        tmdb_id: movie.tmdb,
        duration_secs: 7200,
      },
    });
  }),

  // ── Live TV ─────────────────────────────────────────────────
  http.get(`${API}/live/categories`, () =>
    HttpResponse.json({ categories: sampleCategories }),
  ),

  http.get(`${API}/live/streams`, ({ request }) => {
    const url = new URL(request.url);
    const catId = url.searchParams.get("category_id") || "";
    const filtered = sampleLiveStreams.filter((s) => s.category_id === catId);
    return HttpResponse.json({ streams: filtered });
  }),

  http.get(`${API}/live/all`, () =>
    HttpResponse.json({ streams: sampleLiveStreams }),
  ),

  http.get(`${API}/live/info`, () =>
    HttpResponse.json({ streams: sampleLiveStreams.map((s) => ({ stream_id: s.stream_id, name: s.name, stream_icon: s.stream_icon })) }),
  ),

  // ── Guide / EPG ─────────────────────────────────────────────
  http.get(`${API}/guide`, ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit")) || 60;
    return HttpResponse.json({
      channel_groups: sampleChannelGroups,
      total_channels: sampleChannelGroups.length,
      offset: 0,
      limit,
    });
  }),

  http.get(`${API}/guide/now`, () =>
    HttpResponse.json({
      programmes: Object.fromEntries(
        sampleChannelGroups.map((g) => [g.stream_id, { title: g.programmes[0]?.title || null, channel_name: g.channel_name }]),
      ),
    }),
  ),

  http.get(`${API}/guide/enrich`, () =>
    HttpResponse.json({ enabled: true, result: null }),
  ),

  // ── Search ──────────────────────────────────────────────────
  http.get(`${API}/search`, ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.toLowerCase() || "";
    const matchedMovies = sampleMovies.filter((m) => m.name.toLowerCase().includes(q));
    const matchedSeries = sampleSeries.filter((s) => s.name.toLowerCase().includes(q));
    const matchedLive = sampleLiveStreams.filter((s) => s.name.toLowerCase().includes(q));
    return HttpResponse.json({
      live: matchedLive,
      movies: matchedMovies,
      series: matchedSeries,
      totals: {
        live: matchedLive.length,
        movies: matchedMovies.length,
        series: matchedSeries.length,
      },
    });
  }),

  // ── TMDB ────────────────────────────────────────────────────
  http.get(`${API}/tmdb/tv/trending`, () =>
    HttpResponse.json({ trending: sampleTrending, total_pages: 1, total_results: sampleTrending.length, enabled: false }),
  ),

  http.get(`${API}/tmdb/trending`, () =>
    HttpResponse.json({ trending: sampleTrending, total_pages: 1, total_results: sampleTrending.length, enabled: false }),
  ),

  http.get(`${API}/tmdb/configuration`, () =>
    HttpResponse.json({ enabled: false, images: null }),
  ),

  // Fallback for any unhandled API calls
  http.get(`${API}/:path*`, () =>
    new HttpResponse(null, { status: 404 }),
  ),

  // ── Watchlist / Progress ────────────────────────────────────
  http.get(`${API}/watchlist/progress`, () =>
    HttpResponse.json({ progress: { series: [], movies: [] } }),
  ),
];
