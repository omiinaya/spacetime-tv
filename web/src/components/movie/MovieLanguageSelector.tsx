import { Globe, ChevronDown } from "lucide-react";
import type { MovieLanguage } from "@/lib/types";

/** Maps language codes to display names */
export const LANG_LABELS: Record<string, string> = {
  EN: "English",
  FR: "French",
  DE: "German",
  ES: "Spanish",
  IT: "Italian",
  PT: "Portuguese",
  BR: "Brazilian",
  RU: "Russian",
  GR: "Greek",
  TR: "Turkish",
  NL: "Dutch",
  PL: "Polish",
  IN: "Indian",
  IR: "Persian",
  IL: "Hebrew",
  QC: "Canadian French",
  SO: "Somali",
  LA: "Latin",
  AF: "Afrikaans",
  RO: "Romanian",
  BG: "Bulgarian",
  AL: "Albanian",
  PK: "Urdu",
  KU: "Kurdish",
  PH: "Filipino",
  BN: "Bengali",
  BE: "Belarusian",
  MT: "Maltese",
  CN: "Chinese",
};

export function langLabel(code: string): string {
  return LANG_LABELS[code] || code;
}

interface MovieLanguageSelectorProps {
  languages: MovieLanguage[];
  selectedLang: MovieLanguage;
  onSelect: (lang: MovieLanguage) => void;
  isOpen: boolean;
  onToggle: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
}

export function MovieLanguageSelector({
  languages,
  selectedLang,
  onSelect,
  isOpen,
  onToggle,
  menuRef,
}: MovieLanguageSelectorProps) {
  return (
    <div className="relative inline-block mt-0.5" ref={menuRef}>
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-white/10 text-[11px] sm:text-xs text-white/70 hover:bg-white/15 hover:text-white transition-colors"
      >
        <Globe className="h-3 w-3" />
        {langLabel(selectedLang.code)}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-44 rounded-lg bg-[#1a1a2e] border border-white/10 shadow-xl py-1 z-50 max-h-60 overflow-y-auto">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                onSelect(l);
                onToggle();
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${
                l.code === selectedLang.code
                  ? "text-white font-medium"
                  : "text-white/60"
              }`}
            >
              <span className="w-4 text-center text-[10px] font-bold opacity-50">
                {l.code === selectedLang.code ? "✓" : ""}
              </span>
              {langLabel(l.code)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
