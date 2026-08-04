import {
  Tv,
  CalendarClock,
  Film,
  Tv2,
  Search,
  Heart,
  History,
  Settings,
  Radio,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import WatchlistPopover from "@/components/WatchlistPopover";
import type { Profile } from "@/hooks/useProfile";

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

interface SidebarProps {
  sidebarWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
  showWatchlistPopover: boolean;
  onWatchlistToggle: (show: boolean) => void;
  onProfileSwitch: () => void;
  profile: Profile | null;
}

export default function Sidebar({
  sidebarWidth,
  onResizeStart,
  showWatchlistPopover,
  onWatchlistToggle,
  onProfileSwitch,
  profile,
}: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className="hidden md:flex flex-col h-full bg-sidebar border-r border-border shrink-0"
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
        <nav
          className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5"
          role="navigation"
          aria-label="Main navigation"
        >
          {NAV_ITEMS.map((item) =>
            item.id === "/watchlist" ? (
              <div key={item.id} className="relative">
                <button
                  onClick={() => onWatchlistToggle(!showWatchlistPopover)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                    isActive(item.id)
                      ? "bg-primary/10 text-foreground font-medium border-l-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent",
                  )}
                  aria-label={item.label}
                  aria-current={isActive(item.id) ? "page" : undefined}
                  aria-expanded={showWatchlistPopover}
                  aria-haspopup="dialog"
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </button>
                {showWatchlistPopover && (
                  <WatchlistPopover onClose={() => onWatchlistToggle(false)} />
                )}
              </div>
            ) : (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  isActive(item.id)
                    ? "bg-primary/10 text-foreground font-medium border-l-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent",
                )}
                aria-label={item.label}
                aria-current={isActive(item.id) ? "page" : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </button>
            ),
          )}
        </nav>

        {/* Bottom section: Profile + Settings + Footer */}
        <div className="border-t border-border">
          {/* Profile badge */}
          {profile && (
            <button
              onClick={onProfileSwitch}
              className="w-full flex items-center gap-2.5 px-5 py-2 text-xs transition-colors text-left text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Switch profile"
            >
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate">{profile.name}</span>
            </button>
          )}
          <button
            onClick={() => navigate("/settings")}
            className={cn(
              "w-full flex items-center gap-2.5 px-5 py-2.5 text-sm transition-colors text-left",
              isActive("/settings")
                ? "bg-primary/10 text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            aria-label="Settings"
            aria-current={isActive("/settings") ? "page" : undefined}
          >
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            Settings
          </button>
          <p className="text-[10px] text-muted-foreground/50 text-center px-4 py-2">
            Spacetime-TV
          </p>
          <button
            onClick={() => navigate("/admin")}
            className="w-full text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 text-center pb-2 transition-colors"
          >
            Admin
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="hidden md:block w-[5px] shrink-0 cursor-ew-resize relative z-30 hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={onResizeStart}
      />
    </>
  );
}
