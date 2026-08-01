import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from "react-router";
import {
  Menu,
  Tv,
  Settings,
  CalendarClock,
  Film,
  Tv2,
  Heart,
  History,
  Radio,
  Search,
} from "lucide-react";
import { Toaster } from "sonner";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import ErrorReporter from "@/components/ErrorReporter";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import OfflineBanner from "@/components/OfflineBanner";
import Sidebar from "@/components/Sidebar";
import { BackToTop } from "@/components/BackToTop";
import { cn } from "@/lib/utils";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useProfile, Profile } from "@/hooks/useProfile";
import ProfilePicker from "@/components/ProfilePicker";

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
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );
}

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 240;

// Track the last non-player route for reliable Back navigation.
const BACK_KEY = "stv_back_url";

function saveBackPath(path: string) {
  try {
    sessionStorage.setItem(BACK_KEY, path);
  } catch {} // DOMException: storage quota or unavailable
}

// Intercept all clicks that navigate to /watch/ routes and save the
// current URL BEFORE the navigation happens.
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>("[data-watch-link]");
      if (btn) {
        saveBackPath(window.location.pathname + window.location.search);
      }
    },
    true,
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const { profile, profiles, loading, setProfile, refreshProfiles } =
    useProfile();
  const location = useLocation();
  const { resolvedTheme } = useSettings();

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  // Show profile picker if no profile is selected
  const [profileGate, setProfileGate] = useState(!profile);

  useEffect(() => {
    setProfileGate(!profile);
  }, [profile]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [showWatchlistPopover, setShowWatchlistPopover] = useState(false);

  // Centralized keyboard shortcut registry
  useKeyboardShortcuts();

  // Track last non-player route for Back navigation
  useEffect(() => {
    if (!location.pathname.startsWith("/watch/")) {
      saveBackPath(location.pathname + location.search);
    }
  }, [location]);

  // Scroll to top on cross-page navigation (not watch routes)
  useEffect(() => {
    const main = document.querySelector("main");
    if (main && !location.pathname.startsWith("/watch/")) {
      main.scrollTop = 0;
    }
  }, [location.pathname]);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved =
      localStorage.getItem("stv_sidebar_width") ||
      localStorage.getItem("stv-sidebar-width");
    return saved
      ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parseInt(saved, 10)))
      : SIDEBAR_DEFAULT;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const dragging = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX));
      setSidebarWidth(newWidth);
      sidebarWidthRef.current = newWidth;
    };
    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(
        "stv_sidebar_width",
        String(sidebarWidthRef.current),
      );
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const isWatchRoute = location.pathname.startsWith("/watch/");

  if (profileGate) {
    return (
      <ProfilePicker
        profiles={profiles}
        loading={loading}
        onSelect={(p: Profile) => {
          setProfile(p, p.token);
        }}
        onRefresh={refreshProfiles}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ height: "100dvh" }}>
      {/* Skip to content — keyboard accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:outline-none"
      >
        Skip to main content
      </a>

      <Sidebar
        sidebarWidth={sidebarWidth}
        onResizeStart={handleResizeStart}
        showWatchlistPopover={showWatchlistPopover}
        onWatchlistToggle={setShowWatchlistPopover}
        onProfileSwitch={() => setProfileGate(true)}
        profile={profile}
      />

      {/* Mobile overlay — animated slide-in */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-in fade-in">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 h-full animate-in slide-in-right">
            <div className="flex flex-col h-full bg-sidebar border-r border-border shrink-0">
              {/* Brand header */}
              <div className="flex items-center gap-3 px-5 h-14 border-b border-border shrink-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0">
                  <Tv className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-semibold text-sm">Spacetime-TV</span>
              </div>
              {/* Mobile nav */}
              <nav
                className="flex-1 overflow-y-auto py-4 px-3 space-y-1"
                role="navigation"
                aria-label="Main navigation"
              >
                {[
                  { id: "/", label: "Home", Icon: Tv },
                  { id: "/live", label: "Live TV", Icon: Tv },
                  { id: "/guide", label: "TV Guide", Icon: CalendarClock },
                  { id: "/movies", label: "Movies", Icon: Film },
                  { id: "/series", label: "Series", Icon: Tv2 },
                  { id: "/watchlist", label: "Watchlist", Icon: Heart },
                  { id: "/history", label: "History", Icon: History },
                  { id: "/recordings", label: "Recordings", Icon: Radio },
                  { id: "/search", label: "Search", Icon: Search },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      navigate(id);
                      setMobileOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 text-left",
                      isActive(id)
                        ? "bg-primary/10 text-foreground font-medium border-l-[3px] border-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-[3px] border-transparent",
                    )}
                    aria-label={label}
                    aria-current={isActive(id) ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </nav>
              <div className="border-t border-border p-3">
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    navigate("/settings");
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left"
                >
                  <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main
        id="main-content"
        className="flex-1 overflow-y-auto"
        role="main"
        tabIndex={-1}
      >
        {/* Mobile header — hidden on watch routes */}
        {!isWatchRoute && (
          <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-sidebar/80 backdrop-blur-sm sticky top-0 z-30">
            <button
              onClick={() => setMobileOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => navigate("/")}
            >
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                <Tv className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm">Spacetime-TV</span>
            </div>
          </div>
        )}

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
      </main>

      <ErrorReporter />
      <PWAInstallPrompt />
      <OfflineBanner />
      <KeyboardShortcuts />
      <Toaster
        richColors
        theme={resolvedTheme}
        position="bottom-right"
        closeButton
        toastOptions={{ style: { fontSize: "0.875rem" } }}
      />
      <BackToTop />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AppLayout />
      </SettingsProvider>
    </BrowserRouter>
  );
}
