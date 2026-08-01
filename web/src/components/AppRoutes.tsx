import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy-loaded pages for code splitting
const HomePage = lazy(() => import("@/pages/HomePage"));
const LiveTV = lazy(() => import("@/pages/LiveTV"));
const Guide = lazy(() => import("@/pages/Guide"));
const Movies = lazy(() => import("@/pages/Movies"));
const Series = lazy(() => import("@/pages/Series"));
const SearchPage = lazy(() => import("@/pages/Search"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const WatchlistPage = lazy(() => import("@/pages/WatchlistPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const PersonPage = lazy(() => import("@/pages/PersonPage"));
const RecordingsPage = lazy(() => import("@/pages/RecordingsPage"));
const Player = lazy(() => import("@/components/Player"));
const WatchRecording = lazy(() => import("@/components/WatchRecording"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AgentAccess = lazy(() => import("@/pages/AgentAccess"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// Loading fallback for lazy routes
export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );
}

interface AppRoutesProps {
  isWatchRoute: boolean;
}

/** All application routes wrapped in Suspense + ErrorBoundary. */
export function AppRoutes({ isWatchRoute }: AppRoutesProps) {
  return (
    <div className={isWatchRoute ? "" : "p-6 sm:p-10 lg:p-12"}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/"
            element={
              <ErrorBoundary name="Home">
                <HomePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/live"
            element={
              <ErrorBoundary name="Live TV">
                <LiveTV />
              </ErrorBoundary>
            }
          />
          <Route
            path="/guide"
            element={
              <ErrorBoundary name="Guide">
                <Guide />
              </ErrorBoundary>
            }
          />
          <Route
            path="/movies"
            element={
              <ErrorBoundary name="Movies">
                <Movies />
              </ErrorBoundary>
            }
          />
          <Route
            path="/series"
            element={
              <ErrorBoundary name="Series">
                <Series />
              </ErrorBoundary>
            }
          />
          <Route
            path="/search"
            element={
              <ErrorBoundary name="Search">
                <SearchPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/watchlist"
            element={
              <ErrorBoundary name="Watchlist">
                <WatchlistPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/history"
            element={
              <ErrorBoundary name="History">
                <HistoryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/recordings"
            element={
              <ErrorBoundary name="Recordings">
                <RecordingsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/person/:encodedName"
            element={
              <ErrorBoundary name="Person">
                <PersonPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/settings"
            element={
              <ErrorBoundary name="Settings">
                <SettingsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin"
            element={
              <ErrorBoundary name="Admin">
                <AdminDashboard />
              </ErrorBoundary>
            }
          />
          <Route
            path="/admin/agents"
            element={
              <ErrorBoundary name="Agent Access">
                <AgentAccess />
              </ErrorBoundary>
            }
          />
          <Route
            path="/watch/live/:id"
            element={
              <ErrorBoundary name="Player (live)">
                <Player type="live" />
              </ErrorBoundary>
            }
          />
          <Route
            path="/watch/movie/:id"
            element={
              <ErrorBoundary name="Player (movie)">
                <Player type="movie" />
              </ErrorBoundary>
            }
          />
          <Route
            path="/watch/recording/:id"
            element={
              <ErrorBoundary name="Recording Player">
                <WatchRecording />
              </ErrorBoundary>
            }
          />
          <Route
            path="/watch/series/:seriesId/:epId"
            element={
              <ErrorBoundary name="Player (series)">
                <Player type="series" />
              </ErrorBoundary>
            }
          />
          <Route
            path="*"
            element={
              <ErrorBoundary name="Page Not Found">
                <NotFound />
              </ErrorBoundary>
            }
          />
        </Routes>
      </Suspense>
    </div>
  );
}
