import { Search, X } from "lucide-react";

interface SeriesSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SeriesSearchInput({
  value,
  onChange,
  placeholder = "Filter series...",
}: SeriesSearchInputProps) {
  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
      <label htmlFor="series-search" className="sr-only">
        {placeholder}
      </label>
      <input
        id="series-search"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
