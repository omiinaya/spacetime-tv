interface AdminKeyPromptProps {
  pendingKey: string;
  setPendingKey: (k: string) => void;
  submitKey: () => void;
}

export default function AdminKeyPrompt({
  pendingKey,
  setPendingKey,
  submitKey,
}: AdminKeyPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
        <span className="text-2xl">🔐</span>
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-base font-semibold">Admin Key Required</h2>
        <p className="text-xs text-muted-foreground">
          Enter the admin key configured in the server's .env file
        </p>
      </div>
      <div className="flex gap-2 w-full max-w-xs">
        <input
          type="password"
          value={pendingKey}
          onChange={(e) => setPendingKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitKey()}
          placeholder="Admin key…"
          autoFocus
          className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-sm outline-none focus:border-amber-500/50 transition-colors"
        />
        <button
          onClick={submitKey}
          disabled={!pendingKey}
          className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
