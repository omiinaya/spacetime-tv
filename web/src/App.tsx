import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router";
import {
  Tv,
  CalendarClock,
  Film,
  Tv2,
  Search,
  Heart,
  History,
  Menu,
  Settings,
  Radio,
} from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import ErrorReporter from "@/components/ErrorReporter";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import OfflineBanner from "@/components/OfflineBanner";
import WatchlistPopover from "@/components/WatchlistPopover";
import { BackToTop } from "@/components/BackToTop";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

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
// Uses a global click interceptor — saves the current URL to sessionStorage
// right before any navigation to /watch/ routes. This is 100% reliable
// because it captures the URL at the exact moment of navigation, not via
// useEffect which can fire at unpredictable times.
const BACK_KEY = "stv_back_url";

function saveBackPath(path: string) {
  try { sessionStorage.setItem(BACK_KEY, path); } catch {}
}

// Intercept all clicks that navigate to /watch/ routes and save the
// current URL BEFORE the navigation happens. Uses capture phase to
// fire before e.stopPropagation() in individual button handlers.
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("[data-watch-link]");
    if (btn) {
      saveBackPath(window.location.pathname + window.location.search);
    }
  }, true);
}

const NAV_ITEMS = [
  { id: "/", label: "Home", icon: Tv },
  { id: "/live", label: "Live TV", icon: Tv },
  { id: "/guide", label: "TV Guide", icon: CalendarClock },
  { id: "/movies", label: "Movies", icon: Film },
  { id: "/series", label: "Series", icon: Tv2 },
  { id: "/watchlist", label: "Watchlist", icon: Heart },
  { id: "/history", label: "History", icon: History },
  { id: "/recordings", label: "Recordings", icon: Radio },
  { id: "/search", label: "Search", icon: Search },
];

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showWatchlistPopover, setShowWatchlistPopover] = useState(false);
  const { resolvedTheme } = useSettings();

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
    const saved = localStorage.getItem("stv_sidebar_width") || localStorage.getItem("stv-sidebar-width");
    return saved
      ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parseInt(saved, 10)))
      : SIDEBAR_DEFAULT;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const dragging = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const newWidth = Math.min(
          SIDEBAR_MAX,
          Math.max(SIDEBAR_MIN, ev.clientX)
        );
        setSidebarWidth(newWidth);
        sidebarWidthRef.current = newWidth;
      };
      const handleMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem(
          "stv_sidebar_width",
          String(sidebarWidthRef.current)
        );
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    []
  );

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);
  const isWatchRoute = location.pathname.startsWith("/watch/");

  const sidebar = (
    <div
      className="flex flex-col h-full bg-sidebar border-r border-border shrink-0"
      style={{ width: sidebarWidth }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0">
          <Tv className="h-4 w-4 text-white" />
        </div>
        <span className="font-semibold text-sm">Spacetime-TV</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) =>
          item.id === "/watchlist" ? (
            <div key={item.id} className="relative">
              <button
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-watchlist-close]")) return;
                  setShowWatchlistPopover(v => !v);
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  isActive(item.id)
                    ? "bg-primary/10 text-foreground font-medium border-l-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
                )}
                aria-label={item.label}
                aria-current={isActive(item.id) ? "page" : undefined}
                aria-expanded={showWatchlistPopover}
                aria-haspopup="dialog"
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </button>
              {showWatchlistPopover && !mobileOpen && (
                <WatchlistPopover onClose={() => setShowWatchlistPopover(false)} />
              )}
            </div>
          ) : (
            <button
              key={item.id}
              onClick={() => {
                navigate(item.id);
                setMobileOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                isActive(item.id)
                  ? "bg-primary/10 text-foreground font-medium border-l-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
              )}
              aria-label={item.label}
              aria-current={isActive(item.id) ? "page" : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          )
        )}
      </nav>

      {/* Bottom section: Settings + Footer */}
      <div className="border-t border-border">
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "w-full flex items-center gap-2.5 px-5 py-2.5 text-sm transition-colors text-left",
            isActive("/settings")
              ? "bg-primary/10 text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          aria-label="Settings"
          aria-current={isActive("/settings") ? "page" : undefined}
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
          Settings
        </button>
        <p className="text-[10px] text-muted-foreground/50 text-center px-4 py-2">
          Spacetime-TV · iptv-provider
        </p>
        <button
          onClick={() => navigate("/admin")}
          className="w-full text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 text-center pb-2 transition-colors"
        >
          Admin
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ height: "100dvh" }}>
      {/* Skip to content — keyboard accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:outline-none"
      >
        Skip to main content
      </a>
      {/* Desktop sidebar */}
      <div className="hidden md:block shrink-0">{sidebar}</div>
      {/* Resize handle */}
      <div
        className="hidden md:block w-[5px] shrink-0 cursor-ew-resize relative z-30 hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={handleResizeStart}
      />
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 h-full">{sidebar}</div>
        </div>
      )}

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-y-auto" role="main" tabIndex={-1}>
        {/* Mobile header — hidden on watch routes */}
        {!isWatchRoute && (
        <div className="md:hidden flex items-center gap-3 px-4 h-12 border-b border-border bg-sidebar">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
              <Tv className="h-3 w-3 text-white" />
            </div>
            <span className="font-semibold text-sm">Spacetime-TV</span>
          </div>
        </div>
        )}

        <div className={isWatchRoute ? "" : "p-4 md:p-6 lg:p-8"}>
          <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/live" element={<LiveTV />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/series" element={<Series />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/recordings" element={<RecordingsPage />} />
            <Route path="/person/:encodedName" element={<PersonPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/watch/live/:id" element={<Player type="live" />} />
            <Route path="/watch/movie/:id" element={<Player type="movie" />} />
            <Route path="/watch/recording/:id" element={<WatchRecording />} />
            <Route
              path="/watch/series/:seriesId/:epId"
              element={<Player type="series" />}
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <ErrorReporter />
      <PWAInstallPrompt />
      <OfflineBanner />
      <KeyboardShortcuts />
      <Toaster richColors theme={resolvedTheme} position="bottom-right" closeButton toastOptions={{ style: { fontSize: "0.875rem" } }} />
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
