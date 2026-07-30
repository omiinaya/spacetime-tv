import { useState } from "react";

export default function PinSetup({
  onSet,
}: {
  onSet: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    if (!/^\d+$/.test(pin)) {
      setError("PIN must be digits only");
      return;
    }
    if (pin !== confirm) {
      setError("PINs do not match");
      return;
    }
    setError("");
    await onSet(pin);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-600">
        ✓ PIN has been set
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg border border-border bg-card">
      <p className="text-xs text-muted-foreground">
        Set a PIN to protect adult content. You&apos;ll need to enter it each
        session to view adult channels.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          maxLength={8}
          placeholder="New PIN (4+ digits)"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="flex-1 h-8 px-2.5 rounded border border-border bg-muted text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="password"
          maxLength={8}
          placeholder="Confirm PIN"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
          className="flex-1 h-8 px-2.5 rounded border border-border bg-muted text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={pin.length < 4 || confirm.length < 4}
        className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 transition-opacity"
      >
        Set PIN
      </button>
    </div>
  );
}
