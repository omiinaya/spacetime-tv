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
import { api } from "@/lib/api";
import { Category } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";
import {
  collectAllPrefixes,
  collectAllServices,
  filterCategories,
  isPinConfigured,
} from "@/lib/settings";
import { Skeleton } from "@/components/Skeleton";
import { PinPrompt } from "@/components/PinPrompt";
import PinSetup from "@/components/settings/PinSetup";
import PinManager from "@/components/settings/PinManager";
import { useCloudBackup } from "@/hooks/useCloudBackup";

// ── Inline Components ─────────────────────────────────────────

function ThemeSelector({
  theme,
  onUpdate,
}: {
  theme: string;
  onUpdate: (partial: any) => void;
}) {
  const Icon = theme === "light" ? Sun : theme === "system" ? Monitor : Moon;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
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
        ).map(([mode, label, IconCmp]) => (
          <button
            key={mode}
            onClick={() => onUpdate({ theme: mode })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
              theme === mode
                ? "bg-primary/15 text-primary border-primary/20"
                : "bg-muted text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            <IconCmp className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function LanguageFilter({
  prefixes,
  languages,
  onToggle,
  onClear,
}: {
  prefixes: string[];
  languages: string[];
  onToggle: (lang: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Language / Country</h2>
        {languages.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            {languages.length} selected
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Only show categories from selected languages. Leave empty to show all.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={onClear}
          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            languages.length === 0
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
          }`}
        >
          All
        </button>
        {prefixes.map((lang) => {
          const active = languages.includes(lang);
          return (
            <button
              key={lang}
              onClick={() => onToggle(lang)}
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
  );
}

function ServiceFilter({
  services,
  enabledServices,
  onToggle,
  onClear,
}: {
  services: string[];
  enabledServices: string[];
  onToggle: (svc: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Film className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Streaming Services</h2>
        {enabledServices.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            {enabledServices.length} selected
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Show only movies/series from specific streaming platforms. Leave empty
        to show all.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={onClear}
          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            enabledServices.length === 0
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
          }`}
        >
          All
        </button>
        {services.map((svc) => {
          const active = enabledServices.includes(svc);
          return (
            <button
              key={svc}
              onClick={() => onToggle(svc)}
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
  );
}

function ParentalControls({
  showAdult,
  pinConfigured,
  adultUnlocked,
  onUpdateAdult,
  onSetPin,
  onRemovePin,
  onLockAdult,
}: {
  showAdult: boolean;
  pinConfigured: boolean;
  adultUnlocked: boolean;
  onUpdateAdult: (show: boolean) => void;
  onSetPin: (pin: string) => Promise<void>;
  onRemovePin: () => void;
  onLockAdult: () => void;
}) {
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [showPinPromptChange, setShowPinPromptChange] = useState(false);

  const handleToggleAdult = () => {
    if (showAdult) {
      onUpdateAdult(false);
      onLockAdult();
    } else if (pinConfigured && !adultUnlocked) {
      setShowPinPrompt(true);
    } else {
      onUpdateAdult(true);
    }
  };

  const handleChangePinClick = () => {
    setShowPinPromptChange(true);
  };

  return (
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

      <label className="flex items-center gap-3 cursor-pointer">
        <button
          onClick={handleToggleAdult}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            showAdult ? "bg-primary" : "bg-muted border border-border"
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              showAdult ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-xs text-muted-foreground">
          {showAdult ? "Adult content is visible" : "Adult content is hidden"}
        </span>
        {adultUnlocked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLockAdult();
            }}
            className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 transition-colors"
          >
            Lock again
          </button>
        )}
      </label>

      {!pinConfigured ? (
        <PinSetup onSet={onSetPin} />
      ) : (
        <PinManager
          onChangePin={handleChangePinClick}
          onRemovePin={onRemovePin}
        />
      )}

      {showPinPrompt && (
        <PinPrompt
          title="Unlock Adult Content"
          description="Enter your PIN to show adult content."
          onSuccess={() => {
            setShowPinPrompt(false);
            onUpdateAdult(true);
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
            onRemovePin();
          }}
          onCancel={() => setShowPinPromptChange(false)}
        />
      )}
    </section>
  );
}

function CloudBackupSection({
  cloudLoading,
  cloudError,
  lastUpload,
  lastDownload,
  onUpload,
  onDownload,
  onMerge,
}: {
  cloudLoading: boolean;
  cloudError: string | null;
  lastUpload: number | null;
  lastDownload: number | null;
  onUpload: () => Promise<boolean>;
  onDownload: () => Promise<any>;
  onMerge: () => Promise<any>;
}) {
  return (
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
        Sync your channel favorites and watchlist across devices. Data is stored
        on the server and keyed to this browser&apos;s device ID.
      </p>
      {cloudError && <p className="text-xs text-red-500">{cloudError}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onUpload}
          disabled={cloudLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {cloudLoading ? "Uploading..." : "Upload Backup"}
        </button>
        <button
          onClick={async () => {
            const data = await onDownload();
            if (data) {
              try {
                localStorage.setItem(
                  "stv_channel_favorites",
                  JSON.stringify(data.favorites),
                );
                window.location.reload();
              } catch {} // DOMException
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
            const merged = await onMerge();
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
  );
}

function HiddenCategoriesSection({
  categories,
  hiddenIds,
  onToggle,
}: {
  categories: { id: string; name: string; type: string }[];
  hiddenIds: string[];
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <EyeOff className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Hidden Categories</h2>
        {hiddenIds.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {hiddenIds.length} hidden
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Individually hide specific categories you never want to see.
      </p>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories..."
          className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No categories found
          </div>
        ) : (
          filtered.slice(0, 100).map((cat) => {
            const hidden = hiddenIds.includes(cat.id);
            return (
              <label
                key={`${cat.type}-${cat.id}`}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <button
                  onClick={() => onToggle(cat.id)}
                  className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    hidden
                      ? "bg-destructive/20 border-destructive/30 text-destructive"
                      : "border-border text-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  {hidden && <Check className="h-2.5 w-2.5" />}
                </button>
                <span className="text-[10px] text-muted-foreground/60 w-14 shrink-0">
                  {cat.type}
                </span>
                <span
                  className={`text-[11px] truncate ${hidden ? "text-muted-foreground/40 line-through" : ""}`}
                >
                  {cat.name}
                </span>
              </label>
            );
          })
        )}
        {filtered.length > 100 && (
          <div className="p-2 text-center text-[10px] text-muted-foreground/50">
            Showing first 100 of {filtered.length}. Narrow your search.
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────

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

  const allPrefixes = useMemo(
    () => collectAllPrefixes(liveCats, movieCats, seriesCats),
    [liveCats, movieCats, seriesCats],
  );

  const allServices = useMemo(
    () => collectAllServices(movieCats, seriesCats),
    [movieCats, seriesCats],
  );

  const stats = useMemo(() => {
    const liveVisible = filterCategories(liveCats, settings, true).length;
    const movieVisible = filterCategories(movieCats, settings, false).length;
    const seriesVisible = filterCategories(seriesCats, settings, false).length;
    return { live: liveVisible, movies: movieVisible, series: seriesVisible };
  }, [liveCats, movieCats, seriesCats, settings]);

  const toggleLanguage = (lang: string) => {
    const current = settings.languages;
    update({
      languages: current.includes(lang)
        ? current.filter((l) => l !== lang)
        : [...current, lang],
    });
  };

  const toggleService = (svc: string) => {
    const current = settings.services;
    update({
      services: current.includes(svc)
        ? current.filter((s) => s !== svc)
        : [...current, svc],
    });
  };

  const toggleHideCategory = (catId: string) => {
    const current = settings.hiddenCategories;
    update({
      hiddenCategories: current.includes(catId)
        ? current.filter((id) => id !== catId)
        : [...current, catId],
    });
  };

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

      {/* ── Theme ──────────────────────────────────────── */}
      <ThemeSelector theme={settings.theme} onUpdate={update} />

      {/* ── Language Filter ────────────────────────────────── */}
      <LanguageFilter
        prefixes={allPrefixes}
        languages={settings.languages}
        onToggle={toggleLanguage}
        onClear={() => update({ languages: [] })}
      />

      {/* ── Service Filter ──────────────────────────────── */}
      <ServiceFilter
        services={allServices}
        enabledServices={settings.services}
        onToggle={toggleService}
        onClear={() => update({ services: [] })}
      />

      {/* ── Parental Controls ─────────────────────────────── */}
      <ParentalControls
        showAdult={settings.showAdult}
        pinConfigured={pinConfigured}
        adultUnlocked={adultUnlocked}
        onUpdateAdult={(show) => update({ showAdult: show })}
        onSetPin={handleSetPin}
        onRemovePin={clearAdultPin}
        onLockAdult={lockAdult}
      />

      {/* ── Cloud Backup ───────────────────────────────── */}
      <CloudBackupSection
        cloudLoading={cloudLoading}
        cloudError={cloudError}
        lastUpload={lastUpload}
        lastDownload={lastDownload}
        onUpload={uploadBackup}
        onDownload={downloadBackup}
        onMerge={mergeFavorites}
      />

      {/* ── Hidden Categories ──────────────────────────── */}
      <HiddenCategoriesSection
        categories={allCats}
        hiddenIds={settings.hiddenCategories}
        onToggle={toggleHideCategory}
      />
    </div>
  );
}
