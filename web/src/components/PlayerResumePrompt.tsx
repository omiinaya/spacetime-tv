import { useEffect, useRef } from "react";

interface PlayerResumePromptProps {
  showResumePrompt: boolean;
  resumePos: number | null;
  onResume: () => void;
  onStartOver: () => void;
  fmtTime: (t: number) => string;
}

export default function PlayerResumePrompt({
  showResumePrompt,
  resumePos,
  onResume,
  onStartOver,
  fmtTime,
}: PlayerResumePromptProps) {
  const resumeBtnRef = useRef<HTMLButtonElement>(null);
  // Modal prompt: announce it, move focus to the primary action so keyboard
  // users don't have to tab through the page behind.
  useEffect(() => {
    if (showResumePrompt && resumePos) {
      resumeBtnRef.current?.focus();
    }
  }, [showResumePrompt, resumePos]);

  if (!showResumePrompt || !resumePos) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resume playback"
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4"
    >
      <p className="text-white/80 text-lg">Resume from {fmtTime(resumePos)}?</p>
      <div className="flex gap-3">
        <button
          ref={resumeBtnRef}
          onClick={onResume}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
        >
          Resume
        </button>
        <button
          onClick={onStartOver}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
