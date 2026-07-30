import { Film } from "lucide-react";

interface ServiceFilterProps {
  services: string[];
  enabledServices: string[];
  onToggle: (svc: string) => void;
  onClear: () => void;
}

export default function ServiceFilter({
  services,
  enabledServices,
  onToggle,
  onClear,
}: ServiceFilterProps) {
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
