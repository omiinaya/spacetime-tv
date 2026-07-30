import { Globe } from "lucide-react";

interface LanguageFilterProps {
  prefixes: string[];
  languages: string[];
  onToggle: (lang: string) => void;
  onClear: () => void;
}

export default function LanguageFilter({
  prefixes,
  languages,
  onToggle,
  onClear,
}: LanguageFilterProps) {
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
