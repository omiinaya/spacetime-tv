/** Parse XMLTV time string "20260623043400 +0200" to Date */
export function parseXmltvTime(ts: string): Date {
  const clean = ts.trim();
  const datePart = clean.slice(0, 8);
  const timePart = clean.slice(8, 14);
  const tzPart = clean.slice(15).trim();
  const tzIso = tzPart
    ? tzPart.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")
    : "Z";
  const iso = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}${tzIso}`;
  return new Date(iso);
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Progress fraction of a programme (0-1). 0 if not yet started, 1 if ended. */
export function programmeProgress(p: { start: string; stop: string; is_live?: boolean }, now: Date): number {
  try {
    const start = parseXmltvTime(p.start);
    const stop = parseXmltvTime(p.stop);
    if (now < start) return 0;
    if (now > stop) return 1;
    const duration = stop.getTime() - start.getTime();
    if (duration <= 0) return 0;
    return (now.getTime() - start.getTime()) / duration;
  } catch /* DOMException or SyntaxError */ {
    return 0;
  }
}

/** Format programme time range like "4:34 AM – 6:00 AM" */
export function programmeTimeRange(p: { start: string; stop: string }): string {
  try {
    return `${formatTime(parseXmltvTime(p.start))} – ${formatTime(parseXmltvTime(p.stop))}`;
  } catch /* DOMException or SyntaxError */ {
    return "";
  }
}
