import { Loader2 } from "lucide-react";

interface PlayerLoadingOverlayProps {
  phase: string;
  loadingStep: string | null;
  errorMsg: string | null;
}

export default function PlayerLoadingOverlay({
  phase,
  loadingStep,
  errorMsg,
}: PlayerLoadingOverlayProps) {
  if (phase !== "loading" && phase !== "probing") return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 gap-3">
      <Loader2 className="w-10 h-10 animate-spin text-white/70" />
      <span className="text-white/60 text-sm">
        {loadingStep ||
          (phase === "probing"
            ? "Detecting video format\u2026"
            : "Loading\u2026")}
      </span>
      {errorMsg && <span className="text-white/40 text-xs">{errorMsg}</span>}
    </div>
  );
}
