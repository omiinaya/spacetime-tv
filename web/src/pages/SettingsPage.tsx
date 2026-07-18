import { useEffect, useState, useMemo } from "react";
import {
  Settings,
  Globe,
  EyeOff,
  Film,
  Tv2,
  Tv,
  RotateCcw,
  Check,
  Search,
  Lock,
  Sun,
  Moon,
  Monitor,
  Cloud,
  Upload,
  Download,
  Merge,
} from "lucide-react";
import { api, Category } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import {
  collectAllPrefixes,
  collectAllServices,
  filterCategories,
} from "@/lib/settings";
import { Skeleton } from "@/components/Skeleton";
import { PinPrompt } from "@/components/PinPrompt";
import { isPinConfigured } from "@/lib/settings";
import { useCloudBackup } from "@/hooks/useCloudBackup";

export default function SettingsPage() {
  const {
    settings,
    update,
    reset,
    adultUnlocked,
    setAdultPin,
    clearAdultPin,
    lockAdult,
  } = useSettings();

  const [liveCats, setLiveCats] = useState<Category[]>([]);
  const [movieCats, setMovieCats] = useState<Category[]>([]);
  const [seriesCats, setSeriesCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Hidden category search
  const [hiddenSearch, setHiddenSearch] = useState("");

  // PIN state
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [showPinPromptChange, setShowPinPromptChange] = useState(false);

  const pinConfigured = isPinConfigured(settings);
  const {
    uploadBackup,
    downloadBackup,
    mergeFavorites,
    backupStatus: {
      lastUpload,
      lastDownload,
      loading: cloudLoading,
      error: cloudError,
    },
  } = useCloudBackup();

  const handleSetPin = async (pin: string) => {
    await setAdultPin(pin);
  };

  const handleChangePin = () => {
    setShowPinPromptChange(true);
  };

  const handleAdultToggle = () => {
    if (settings.showAdult) {
      // Turning off — no PIN needed
      update({ showAdult: false });
      lockAdult();
    } else if (pinConfigured && !adultUnlocked) {
      // Turning on — PIN required
      setShowPinPrompt(true);
    } else {
      // No PIN set or already unlocked
      update({ showAdult: true });
    }
  };

  useEffect(() => {
    Promise.all([
      api.live
        .categories()
        .then((d) => d.categories)
        .catch(() => []),
      api.movies
        .categories()
        .then((d) => d.categories)
        .catch(() => []),
      api.series
        .categories()
        .then((d) => d.categories)
        .catch(() => []),
    ])
      .then(([l, m, s]) => {
        setLiveCats(l);
        setMovieCats(m);
        setSeriesCats(s);
      })
      .finally(() => setLoading(false));
  }, []);

  // Collect all prefixes across content types
  const allPrefixes = useMemo(
    () => collectAllPrefixes(liveCats, movieCats, seriesCats),
    [liveCats, movieCats, seriesCats],
  );

  const allServices = useMemo(
    () => collectAllServices(movieCats, seriesCats),
    [movieCats, seriesCats],
  );

  // Count how many categories would be visible with current settings
  const stats = useMemo(() => {
    const liveVisible = filterCategories(liveCats, settings, true).length;
    const movieVisible = filterCategories(movieCats, settings, false).length;
    const seriesVisible = filterCategories(seriesCats, settings, false).length;
    return { live: liveVisible, movies: movieVisible, series: seriesVisible };
  }, [liveCats, movieCats, seriesCats, settings]);

  const toggleLanguage = (lang: string) => {
    const current = settings.languages;
    if (current.includes(lang)) {
      update({ languages: current.filter((l) => l !== lang) });
    } else {
      update({ languages: [...current, lang] });
    }
  };

  const toggleService = (svc: string) => {
    const current = settings.services;
    if (current.includes(svc)) {
      update({ services: current.filter((s) => s !== svc) });
    } else {
      update({ services: [...current, svc] });
    }
  };

  const toggleHideCategory = (catId: string) => {
    const current = settings.hiddenCategories;
    if (current.includes(catId)) {
      update({ hiddenCategories: current.filter((id) => id !== catId) });
    } else {
      update({ hiddenCategories: [...current, catId] });
    }
  };

  // All categories for the hide list (searchable)
  const allCats = useMemo(() => {
    const cats: { id: string; name: string; type: string; hidden: boolean }[] =
      [];
    for (const c of liveCats)
      cats.push({
        id: c.category_id,
        name: c.category_name,
        type: "Live TV",
        hidden: settings.hiddenCategories.includes(c.category_id),
      });
    for (const c of movieCats)
      cats.push({
        id: c.category_id,
        name: c.category_name,
        type: "Movies",
        hidden: settings.hiddenCategories.includes(c.category_id),
      });
    for (const c of seriesCats)
      cats.push({
        id: c.category_id,
        name: c.category_name,
        type: "Series",
        hidden: settings.hiddenCategories.includes(c.category_id),
      });
    return cats;
  }, [liveCats, movieCats, seriesCats, settings.hiddenCategories]);

  const filteredCatList = useMemo(() => {
    if (!hiddenSearch.trim()) return allCats;
    const q = hiddenSearch.toLowerCase();
    return allCats.filter((c) => c.name.toLowerCase().includes(q));
  }, [allCats, hiddenSearch]);

  const enabledLangCount = settings.languages.length;
  const enabledSvcCount = settings.services.length;
  const hiddenCatCount = settings.hiddenCategories.length;

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="w-20 h-5" />
            <Skeleton className="w-32 h-3.5" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="w-full h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Filter out content you don&apos;t want to see
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-card text-xs">
        <div className="flex items-center gap-1.5">
          <Tv className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{stats.live}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Film className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{stats.movies}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Tv2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{stats.series}</span>
        </div>
        <span className="text-muted-foreground/50">categories visible</span>
        <button
          onClick={reset}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* ── Theme ──────────────────────────��───────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          {settings.theme === "light" ? (
            <Sun className="h-4 w-4 text-muted-foreground" />
          ) : settings.theme === "system" ? (
            <Monitor className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Moon className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-sm font-semibold">Theme</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose your preferred appearance.
        </p>
        <div className="flex gap-2">
          {(
            [
              ["dark", "Dark", Moon],
              ["light", "Light", Sun],
              ["system", "System", Monitor],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              onClick={() => update({ theme: mode })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
                settings.theme === mode
                  ? "bg-primary/15 text-primary border-primary/20"
                  : "bg-muted text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Language Filter ─────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Language / Country</h2>
          {enabledLangCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {enabledLangCount} selected
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Only show categories from selected languages. Leave empty to show all.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => update({ languages: [] })}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              enabledLangCount === 0
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            All
          </button>
          {allPrefixes.map((lang) => {
            const active = settings.languages.includes(lang);
            return (
              <button
                key={lang}
                onClick={() => toggleLanguage(lang)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors border ${
                  active
                    ? "bg-primary/15 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                {lang}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Service Filter (Movies/Series) ──────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Streaming Services</h2>
          {enabledSvcCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {enabledSvcCount} selected
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Show only movies/series from specific streaming platforms. Leave empty
          to show all.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => update({ services: [] })}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
              enabledSvcCount === 0
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            All
          </button>
          {allServices.map((svc) => {
            const active = settings.services.includes(svc);
            return (
              <button
                key={svc}
                onClick={() => toggleService(svc)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors border ${
                  active
                    ? "bg-primary/15 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                {svc}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Parental Controls ────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Parental Controls</h2>
          {pinConfigured && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              PIN set
            </span>
          )}
        </div>

        {/* Adult toggle — always visible */}
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            onClick={handleAdultToggle}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              settings.showAdult
                ? "bg-primary"
                : "bg-muted border border-border"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                settings.showAdult ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-xs text-muted-foreground">
            {settings.showAdult
              ? "Adult content is visible"
              : "Adult content is hidden"}
          </span>
          {adultUnlocked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                lockAdult();
              }}
              className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 transition-colors"
            >
              Lock again
            </button>
          )}
        </label>

        {/* PIN Management */}
        {!pinConfigured ? (
          <PinSetup onSet={handleSetPin} />
        ) : (
          <PinManager
            onChangePin={handleChangePin}
            onRemovePin={clearAdultPin}
          />
        )}

        {/* PIN Prompt Modal */}
        {showPinPrompt && (
          <PinPrompt
            title="Unlock Adult Content"
            description="Enter your PIN to show adult content."
            onSuccess={() => {
              setShowPinPrompt(false);
              update({ showAdult: true });
            }}
            onCancel={() => setShowPinPrompt(false)}
          />
        )}
        {showPinPromptChange && (
          <PinPrompt
            title="Change PIN"
            description="Enter your current PIN to continue."
            onSuccess={() => {
              setShowPinPromptChange(false);
              // Show the PIN setup form to set a new PIN
              clearAdultPin();
            }}
            onCancel={() => setShowPinPromptChange(false)}
          />
        )}
      </section>

      {/* ── Cloud Backup ────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Cloud Backup</h2>
          {(lastUpload || lastDownload) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">
              synced
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Sync your channel favorites and watchlist across devices. Data is
          stored on the server and keyed to this browser's device ID.
        </p>
        {cloudError && <p className="text-xs text-red-500">{cloudError}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              await uploadBackup();
            }}
            disabled={cloudLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {cloudLoading ? "Uploading..." : "Upload Backup"}
          </button>
          <button
            onClick={async () => {
              const data = await downloadBackup();
              if (data) {
                // Apply downloaded favorites to localStorage
                try {
                  localStorage.setItem(
                    "stv_channel_favorites",
                    JSON.stringify(data.favorites),
                  );
                  window.location.reload();
                } catch {} // DOMException: storage quota or disabled
              }
            }}
            disabled={cloudLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {cloudLoading ? "Downloading..." : "Download & Restore"}
          </button>
          <button
            onClick={async () => {
              const merged = await mergeFavorites();
              if (merged) {
                localStorage.setItem(
                  "stv_channel_favorites",
                  JSON.stringify(merged),
                );
                window.location.reload();
              }
            }}
            disabled={cloudLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Merge className="h-3.5 w-3.5" />
            {cloudLoading ? "Merging..." : "Merge Favorites"}
          </button>
        </div>
      </section>

      {/* ── Hidden Categories ───────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <EyeOff className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Hidden Categories</h2>
          {hiddenCatCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {hiddenCatCount} hidden
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Individually hide specific categories you never want to see.
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={hiddenSearch}
            onChange={(e) => setHiddenSearch(e.target.value)}
            placeholder="Search categories..."
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Category list */}
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
          {filteredCatList.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No categories found
            </div>
          ) : (
            filteredCatList.slice(0, 100).map((cat) => (
              <label
                key={`${cat.type}-${cat.id}`}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <button
                  onClick={() => toggleHideCategory(cat.id)}
                  className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    cat.hidden
                      ? "bg-destructive/20 border-destructive/30 text-destructive"
                      : "border-border text-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  {cat.hidden && <Check className="h-2.5 w-2.5" />}
                </button>
                <span className="text-[10px] text-muted-foreground/60 w-14 shrink-0">
                  {cat.type}
                </span>
                <span
                  className={`text-[11px] truncate ${cat.hidden ? "text-muted-foreground/40 line-through" : ""}`}
                >
                  {cat.name}
                </span>
              </label>
            ))
          )}
          {filteredCatList.length > 100 && (
            <div className="p-2 text-center text-[10px] text-muted-foreground/50">
              Showing first 100 of {filteredCatList.length}. Narrow your search.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ── PIN sub-components ──────────────────────────────────────────────────────

function PinSetup({ onSet }: { onSet: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    if (!/^\d+$/.test(pin)) {
      setError("PIN must be digits only");
      return;
    }
    if (pin !== confirm) {
      setError("PINs do not match");
      return;
    }
    setError("");
    await onSet(pin);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-600">
        ✓ PIN has been set
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg border border-border bg-card">
      <p className="text-xs text-muted-foreground">
        Set a PIN to protect adult content. You&apos;ll need to enter it each
        session to view adult channels.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          maxLength={8}
          placeholder="New PIN (4+ digits)"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="flex-1 h-8 px-2.5 rounded border border-border bg-muted text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="password"
          maxLength={8}
          placeholder="Confirm PIN"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
          className="flex-1 h-8 px-2.5 rounded border border-border bg-muted text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={pin.length < 4 || confirm.length < 4}
        className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 transition-opacity"
      >
        Set PIN
      </button>
    </div>
  );
}

function PinManager({
  onChangePin,
  onRemovePin,
}: {
  onChangePin: () => void;
  onRemovePin: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onChangePin}
        className="px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        Change PIN
      </button>
      <button
        onClick={() => {
          if (confirm("Remove your PIN? Adult content will be unprotected."))
            onRemovePin();
        }}
        className="px-3 py-1.5 rounded border border-red-500/30 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
      >
        Remove PIN
      </button>
    </div>
  );
}
