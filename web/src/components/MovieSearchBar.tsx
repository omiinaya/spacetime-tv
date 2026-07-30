import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { SearchHistory } from "@/components/SearchHistory";

interface MovieSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
  onAddHistory?: (value: string) => void;
  placeholder?: string;
}

export default function MovieSearchBar({
  value,
  onChange,
  onSearch,
  onAddHistory,
  placeholder = "Search movies...",
}: MovieSearchBarProps) {
  const [showHistory, setShowHistory] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (newValue: string) => {
    onChange(newValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(newValue);
    }, 300);
  };

  const commitSearch = (commitValue: string) => {
    onChange(commitValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    onSearch(commitValue);
    onAddHistory?.(commitValue);
    setShowHistory(false);
  };

  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          if (!value) setShowHistory(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim().length >= 2) {
            commitSearch(value);
          }
        }}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <SearchHistory
        show={showHistory}
        onClose={() => setShowHistory(false)}
        onSelect={(q) => commitSearch(q)}
      />
      {value && (
        <button
          onClick={() => {
            onChange("");
            if (debounceRef.current) clearTimeout(debounceRef.current);
            onSearch("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
