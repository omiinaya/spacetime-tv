import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface PinPromptProps {
  onSuccess: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export function PinPrompt({
  onSuccess,
  onCancel,
  title = "Parental Controls",
  description = "Enter your PIN to access adult content.",
}: PinPromptProps) {
  const { unlockAdult } = useSettings();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, true);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) return;
    setChecking(true);
    setError(false);
    const ok = await unlockAdult(pin);
    setChecking(false);
    if (ok) {
      onSuccess();
    } else {
      setError(true);
      setPin("");
      inputRef.current?.focus();
    }
  }, [pin, unlockAdult, onSuccess]);

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);
    if (newPin.length === 4) {
      // Auto-submit after a brief delay
      setTimeout(() => handleSubmit(), 150);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const handleClear = () => {
    setPin("");
    setError(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Backspace") {
      handleBackspace();
    } else if (e.key === "Escape") {
      onCancel();
    } else if (/^[0-9]$/.test(e.key)) {
      handleDigit(e.key);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{title}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* PIN display */}
        <div className="flex justify-center gap-3 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-colors ${
                error
                  ? "border-red-500 bg-red-500/10 text-red-500"
                  : pin.length > i
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground/30"
              }`}
            >
              {pin.length > i ? "●" : ""}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 justify-center mb-3 text-xs text-red-500">
            <ShieldAlert className="h-3.5 w-3.5" />
            Incorrect PIN. Try again.
          </div>
        )}

        {/* Checking spinner */}
        {checking && (
          <div className="flex justify-center mb-3">
            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2" onKeyDown={handleKeyDown}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => handleDigit(String(n))}
              disabled={pin.length >= 4 || checking}
              className="h-12 rounded-lg bg-muted hover:bg-muted/70 text-foreground font-medium text-lg transition-colors disabled:opacity-40"
            >
              {n}
            </button>
          ))}
          <button
            onClick={handleClear}
            disabled={pin.length === 0 || checking}
            className="h-12 rounded-lg bg-muted/50 hover:bg-muted/70 text-muted-foreground text-xs font-medium transition-colors disabled:opacity-30"
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit("0")}
            disabled={pin.length >= 4 || checking}
            className="h-12 rounded-lg bg-muted hover:bg-muted/70 text-foreground font-medium text-lg transition-colors disabled:opacity-40"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={pin.length === 0 || checking}
            className="h-12 rounded-lg bg-muted/50 hover:bg-muted/70 text-muted-foreground text-xs font-medium transition-colors disabled:opacity-30"
          >
            ⌫
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          className="w-full mt-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
