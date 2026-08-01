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
import { cn } from "@/lib/utils";

const MOBILE_NAV_ITEMS = [
  { id: "/", label: "Home", Icon: Tv },
  { id: "/live", label: "Live TV", Icon: Tv },
  { id: "/guide", label: "TV Guide", Icon: CalendarClock },
  { id: "/movies", label: "Movies", Icon: Film },
  { id: "/series", label: "Series", Icon: Tv2 },
  { id: "/watchlist", label: "Watchlist", Icon: Heart },
  { id: "/history", label: "History", Icon: History },
  { id: "/recordings", label: "Recordings", Icon: Radio },
  { id: "/search", label: "Search", Icon: Search },
];

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  isActive: (path: string) => boolean;
}

/** Slide-in mobile navigation drawer (md:hidden). */
export function MobileNav({
  open,
  onClose,
  onNavigate,
  isActive,
}: MobileNavProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden animate-in fade-in">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
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
            {MOBILE_NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  onNavigate(id);
                  onClose();
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
                onNavigate("/settings");
                onClose();
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
  );
}

interface MobileHeaderProps {
  onOpen: () => void;
  onNavigate: (path: string) => void;
}

/** Sticky mobile top bar with hamburger + brand (hidden on watch routes). */
export function MobileHeader({ onOpen, onNavigate }: MobileHeaderProps) {
  return (
    <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-sidebar/80 backdrop-blur-sm sticky top-0 z-30">
      <button
        onClick={onOpen}
        className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => onNavigate("/")}
      >
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
          <Tv className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-semibold text-sm">Spacetime-TV</span>
      </div>
    </div>
  );
}
