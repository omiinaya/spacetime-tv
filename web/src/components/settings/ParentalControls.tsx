import { useState } from "react";
import { Lock } from "lucide-react";
import { PinPrompt } from "@/components/PinPrompt";
import PinSetup from "@/components/settings/PinSetup";
import PinManager from "@/components/settings/PinManager";

interface ParentalControlsProps {
  showAdult: boolean;
  pinConfigured: boolean;
  adultUnlocked: boolean;
  onUpdateAdult: (show: boolean) => void;
  onSetPin: (pin: string) => Promise<void>;
  onRemovePin: () => void;
  onLockAdult: () => void;
}

export default function ParentalControls({
  showAdult,
  pinConfigured,
  adultUnlocked,
  onUpdateAdult,
  onSetPin,
  onRemovePin,
  onLockAdult,
}: ParentalControlsProps) {
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [showPinPromptChange, setShowPinPromptChange] = useState(false);

  const handleToggleAdult = () => {
    if (showAdult) {
      onUpdateAdult(false);
      onLockAdult();
    } else if (pinConfigured && !adultUnlocked) {
      setShowPinPrompt(true);
    } else {
      onUpdateAdult(true);
    }
  };

  const handleChangePinClick = () => {
    setShowPinPromptChange(true);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Parental Controls</h2>
        {pinConfigured && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            PIN set
          </span>
        )}
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <button
          onClick={handleToggleAdult}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            showAdult ? "bg-primary" : "bg-muted border border-border"
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              showAdult ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-xs text-muted-foreground">
          {showAdult ? "Adult content is visible" : "Adult content is hidden"}
        </span>
        {adultUnlocked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLockAdult();
            }}
            className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 transition-colors"
          >
            Lock again
          </button>
        )}
      </label>

      {!pinConfigured ? (
        <PinSetup onSet={onSetPin} />
      ) : (
        <PinManager
          onChangePin={handleChangePinClick}
          onRemovePin={onRemovePin}
        />
      )}

      {showPinPrompt && (
        <PinPrompt
          title="Unlock Adult Content"
          description="Enter your PIN to show adult content."
          onSuccess={() => {
            setShowPinPrompt(false);
            onUpdateAdult(true);
          }}
          onCancel={() => setShowPinPrompt(false)}
        />
      )}
      {showPinPromptChange && (
        <PinPrompt
          title="Change PIN"
          description="Enter your current PIN to continue."
          onSuccess={() => {
            setShowPinPromptChange(false);
            onRemovePin();
          }}
          onCancel={() => setShowPinPromptChange(false)}
        />
      )}
    </section>
  );
}
