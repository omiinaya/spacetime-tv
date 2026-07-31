import { useState } from "react";
import { Cloud, Upload, Download, Merge } from "lucide-react";

interface CloudBackupData {
  favorites: number[];
  watchlist: number[];
  seriesWatchlist: number[];
}

interface CloudBackupSectionProps {
  cloudLoading: boolean;
  cloudError: string | null;
  lastUpload: number | null;
  lastDownload: number | null;
  onUpload: () => Promise<boolean>;
  onDownload: () => Promise<CloudBackupData | null>;
  onMerge: () => Promise<number[] | null>;
}

const FAV_KEY = "stv_channel_favorites";
const WATCHLIST_KEY = "stv_watchlist";
const SERIES_WATCHLIST_KEY = "stv_watchlist_series";

/** Write restored data to localStorage then reload so consumers re-read on mount. */
function applyRestore(data: CloudBackupData) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(data.favorites));
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(data.watchlist));
    localStorage.setItem(
      SERIES_WATCHLIST_KEY,
      JSON.stringify(data.seriesWatchlist),
    );
  } catch {} // DOMException: localStorage quota
  window.location.reload();
}

/** Write merged favorites to localStorage then reload. */
function applyMerged(merged: number[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(merged));
  } catch {} // DOMException: localStorage quota
  window.location.reload();
}

export default function CloudBackupSection({
  cloudLoading,
  cloudError,
  lastUpload,
  lastDownload,
  onUpload,
  onDownload,
  onMerge,
}: CloudBackupSectionProps) {
  const [working, setWorking] = useState(false);

  const withWorking =
    (fn: () => Promise<unknown>) => async (): Promise<void> => {
      setWorking(true);
      try {
        await fn();
      } finally {
        setWorking(false);
      }
    };

  const handleUpload = withWorking(async () => {
    await onUpload();
  });

  const handleDownload = withWorking(async () => {
    const data = await onDownload();
    if (data) applyRestore(data);
  });

  const handleMerge = withWorking(async () => {
    const merged = await onMerge();
    if (merged) applyMerged(merged);
  });

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
          onClick={handleUpload}
          disabled={cloudLoading || working}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {cloudLoading ? "Uploading..." : "Upload Backup"}
        </button>
        <button
          onClick={handleDownload}
          disabled={cloudLoading || working}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {cloudLoading ? "Downloading..." : "Download & Restore"}
        </button>
        <button
          onClick={handleMerge}
          disabled={cloudLoading || working}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Merge className="h-3.5 w-3.5" />
          {cloudLoading ? "Merging..." : "Merge Favorites"}
        </button>
      </div>
    </section>
  );
}
