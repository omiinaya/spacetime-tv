# MSW (Mock Service Worker) — Testing Patterns

This project uses [MSW v2](https://mswjs.io/) for API-level integration testing.
MSW intercepts actual `fetch()` calls at the network layer so tests can exercise
the real `@/lib/api` module without a running backend.

## Why MSW?

- ✅ Tests the **real** `api` module (URL construction, query params, JSON parsing)
- ✅ No `vi.mock("@/lib/api")` needed — **less boilerplate, more confidence**
- ✅ Handlers are shared across all tests in `@/mocks/handlers.ts`
- ✅ Per-test overrides via `server.use()` — easy error/edge-case simulation
- ✅ Catches regressions in the API client itself

## How It's Set Up

- **src/test-setup.ts** — starts the MSW server before all tests, resets handlers
  after each test, closes after all tests.
- **src/mocks/handlers.ts** — default request handlers and fixture data for every
  API endpoint (series, movies, live TV, guide, search, TMDB, watchlist).
- **src/mocks/server.ts** — MSW server instance using `setupServer` (Node).

## Patterns

### 1. New test files (preferred) — use the real `api` module

```ts
// No vi.mock("@/lib/api") — the component calls api.*() methods,
// which call fetch(), which MSW intercepts.
import { api } from "@/lib/api";

it("returns series from default handler", async () => {
  const result = await api.series.categories();
  expect(result.categories).toHaveLength(2);
});
```

### 2. Migrating from vi.mock() — remove the API mock

**Before (vi.mock):**
```ts
const mockSeriesCategories = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    series: {
      categories: (...args) => mockSeriesCategories(...args),
      list: (...args) => mockSeriesList(...args),
    },
  },
}));
// Then manually resolve/reject:
mockSeriesCategories.mockResolvedValue({ categories: [...] });
mockSeriesCategories.mockRejectedValue(new Error("Oops"));
```

**After (MSW):**
```ts
// Remove the entire vi.mock("@/lib/api") block.
// The real api module makes fetch calls → MSW intercepts them.
// Default handlers in handlers.ts already return sensible fixture data.

// For per-test overrides:
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";

server.use(
  http.get("/api/series/categories", () =>
    HttpResponse.json({ categories: [{ category_id: "99", category_name: "Custom", parent_id: 0 }] }),
  ),
);

// For error states:
server.use(
  http.get("/api/series/categories", () =>
    new HttpResponse(null, { status: 500 }),
  ),
);
```

### 3. Loading state — pending promise

```ts
it("shows skeleton while loading", async () => {
  server.use(
    http.get("/api/series/categories", () => new Promise(() => {})), // never resolves
    http.get("/api/series", () => new Promise(() => {})),
  );
  render(<SeriesPage />);
  expect(screen.getByText("Series")).not.toBeInTheDocument();
});
```

### 4. Error state — HTTP error

```ts
it("shows error banner on 500", async () => {
  server.use(
    http.get("/api/series/categories", () =>
      new HttpResponse(null, { status: 500 }),
    ),
  );
  render(<SeriesPage />);
  await waitFor(() => {
    expect(screen.getByText(/API error 500/)).toBeInTheDocument();
  });
});
```

The `api` module throws `"API error ${status}"` on non-2xx responses, so the
component will display that text in its error banner.

### 5. Empty state — empty array

```ts
it("shows empty state when no data", async () => {
  server.use(
    http.get("/api/series", () =>
      HttpResponse.json({ series: [], total: 0, offset: 0, limit: 20 }),
    ),
  );
  render(<SeriesPage />);
  expect(await screen.findByText("No series available")).toBeInTheDocument();
});
```

### 6. Custom response data

```ts
it("renders a single custom series", async () => {
  server.use(
    http.get("/api/series", () =>
      HttpResponse.json({
        series: [{ num: 1, name: "Custom Series", series_id: 999, category_id: "1" }],
        total: 1, offset: 0, limit: 20,
      }),
    ),
  );
  render(<SeriesPage />);
  expect(await screen.findByText("Custom Series")).toBeInTheDocument();
});
```

### 7. Integration tests against the raw api module

See `src/mocks/__tests__/api.msw.test.ts` for 21 integration tests that exercise
every endpoint in the `api` module through MSW.

## Available Handlers

| Endpoint | Handler | Returns |
|---|---|---|
| `GET /api/series/categories` | `sampleCategories` | 2 categories (Action, Drama) |
| `GET /api/series?category_id=` | Filtered from `sampleSeries` | 3 series (Breaking Bad, Stranger Things, The Office) |
| `GET /api/series/:id` | Full series detail + seasons + episodes | |
| `GET /api/movies/categories` | `sampleCategories` (same as series) | |
| `GET /api/movies/unified` | `sampleMovies` (The Matrix, Inception) | |
| `GET /api/movies/:id` | Movie info with cast/director/genre | |
| `GET /api/live/categories` | `sampleCategories` | |
| `GET /api/live/streams` | Filtered from `sampleLiveStreams` | |
| `GET /api/live/all` | All live streams | |
| `GET /api/guide` | Channel groups with programmes | |
| `GET /api/guide/now` | Now-playing programmes | |
| `GET /api/search?q=` | Filtered movies/series/live | |
| `GET /api/tmdb/tv/trending` | Sample trending data | |
| `GET /api/tmdb/trending` | Sample trending data | |
| `GET /api/watchlist/progress` | Empty progress | |

See `src/mocks/handlers.ts` for the full fixture data and handler definitions.

## Fixture Data Reference

Import fixture types from `@/mocks/handlers` for use in test assertions:

```ts
import { sampleSeries, sampleMovies, sampleCategories } from "@/mocks/handlers";
```

Available exports:
- `sampleCategories` — `Category[]` (Action, Drama)
- `sampleSeries` — `Series[]` (Breaking Bad, Stranger Things, The Office)
- `sampleMovies` — `UnifiedMovie[]` (The Matrix, Inception)
- `sampleLiveStreams` — `LiveStream[]` (CNN, BBC World)
- `sampleChannelGroups` — `ChannelGroup[]` (CNN with programme)
- `sampleTrending` — trending data for TMDB

## Migration Checklist (vi.mock → MSW)

When migrating an existing page component test from `vi.mock("@/lib/api")`:

1. [ ] Remove the `vi.mock("@/lib/api", ...)` block and all associated mock functions
2. [ ] Remove `setupDefaultMocks()` API-related setup (resolved values)
3. [ ] Import `server`, `http`, `HttpResponse` from msw
4. [ ] Replace loading state mocks with `server.use(http.get(..., () => new Promise(() => {})))`
5. [ ] Replace error state mocks with `server.use(http.get(..., () => new HttpResponse(null, { status: 500 })))`
6. [ ] Replace custom data mocks with `server.use(http.get(..., () => HttpResponse.json({...})))`
7. [ ] Adjust error text expectations (component now shows "API error 500" instead of mock's custom message)
8. [ ] Keep non-API mocks (watchlist, continueWatching, SettingsContext, child components, IntersectionObserver, ResizeObserver)
9. [ ] Run tests and fix any expectation mismatches
