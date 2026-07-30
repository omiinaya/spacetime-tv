export default function PinManager({
  onChangePin,
  onRemovePin,
}: {
  onChangePin: () => void;
  onRemovePin: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onChangePin}
        className="px-3 py-1.5 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        Change PIN
      </button>
      <button
        onClick={() => {
          if (confirm("Remove your PIN? Adult content will be unprotected."))
            onRemovePin();
        }}
        className="px-3 py-1.5 rounded border border-red-500/30 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
      >
        Remove PIN
      </button>
    </div>
  );
}
