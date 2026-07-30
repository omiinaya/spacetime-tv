import { useState } from "react";
import { Cloud, Upload, Download, Merge } from "lucide-react";

interface CloudBackupSectionProps {
  cloudLoading: boolean;
  cloudError: string | null;
  lastUpload: number | null;
  lastDownload: number | null;
  onUpload: () => Promise<boolean>;
  onDownload: () => Promise<unknown>;
  onMerge: () => Promise<unknown>;
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

  const wrap = (fn: () => Promise<unknown>) => async () => {
    setWorking(true);
    try {
      await fn();
    } finally {
      setWorking(false);
    }
  };

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
          onClick={wrap(onUpload)}
          disabled={cloudLoading || working}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {cloudLoading ? "Uploading..." : "Upload Backup"}
        </button>
        <button
          onClick={wrap(onDownload)}
          disabled={cloudLoading || working}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {cloudLoading ? "Downloading..." : "Download & Restore"}
        </button>
        <button
          onClick={wrap(onMerge)}
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
