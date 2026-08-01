import { useEffect, useState } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router";
import { Toaster } from "sonner";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import ErrorReporter from "@/components/ErrorReporter";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import OfflineBanner from "@/components/OfflineBanner";
import Sidebar from "@/components/Sidebar";
import { BackToTop } from "@/components/BackToTop";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useProfile, Profile } from "@/hooks/useProfile";
import ProfilePicker from "@/components/ProfilePicker";
import { MobileNav, MobileHeader } from "@/components/MobileNav";
import { AppRoutes } from "@/components/AppRoutes";
import { saveBackPath } from "@/lib/backNavigation";
import { useSidebarResize } from "@/hooks/useSidebarResize";

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

  const { sidebarWidth, onResizeStart } = useSidebarResize();

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
        onResizeStart={onResizeStart}
        showWatchlistPopover={showWatchlistPopover}
        onWatchlistToggle={setShowWatchlistPopover}
        onProfileSwitch={() => setProfileGate(true)}
        profile={profile}
      />

      {/* Mobile overlay — animated slide-in */}
      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onNavigate={navigate}
        isActive={isActive}
      />

      {/* Main content */}
      <main
        id="main-content"
        className="flex-1 overflow-y-auto"
        role="main"
        tabIndex={-1}
      >
        {/* Mobile header — hidden on watch routes */}
        {!isWatchRoute && (
          <MobileHeader
            onOpen={() => setMobileOpen(true)}
            onNavigate={navigate}
          />
        )}

        <AppRoutes isWatchRoute={isWatchRoute} />
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
