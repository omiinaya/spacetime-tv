import { useEffect, useState, useMemo } from "react";
import { Settings, Film, Tv2, Tv, RotateCcw } from "lucide-react";
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
import { useCloudBackup } from "@/hooks/useCloudBackup";
import ThemeSelector from "@/components/settings/ThemeSelector";
import LanguageFilter from "@/components/settings/LanguageFilter";
import ServiceFilter from "@/components/settings/ServiceFilter";
import ParentalControls from "@/components/settings/ParentalControls";
import CloudBackupSection from "@/components/settings/CloudBackupSection";
import HiddenCategoriesSection from "@/components/settings/HiddenCategoriesSection";
import ProviderSettings from "@/components/settings/ProviderSettings";

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

      {/* ── IPTV Provider ─────────────────────────────────── */}
      <ProviderSettings />

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
