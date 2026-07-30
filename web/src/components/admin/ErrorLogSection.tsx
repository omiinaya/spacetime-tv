import { AlertTriangle } from "lucide-react";
import { fmtTime } from "@/pages/AdminDashboard";

interface ErrorLogSectionProps {
  errors: { ts: number; message: string; path: string }[];
  total: number;
}

export default function ErrorLogSection({
  errors,
  total,
}: ErrorLogSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <h2 className="text-sm font-semibold">Recent Errors ({total} total)</h2>
      </div>
      {errors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No errors recorded.</p>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
          {errors.map((e, i) => (
            <div
              key={i}
              className="px-4 py-2 border-b border-border/30 last:border-0 text-xs"
            >
              <span className="text-muted-foreground">{fmtTime(e.ts)}</span>
              {" — "}
              <span className="text-red-400">{e.message}</span>
              {e.path && (
                <span className="text-muted-foreground/50 ml-2">{e.path}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
