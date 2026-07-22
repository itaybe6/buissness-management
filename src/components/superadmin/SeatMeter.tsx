/** Seat usage bar. `cap == null` means the business has no user limit. */
export function SeatMeter({ used, cap }: { used: number; cap: number | null }) {
  if (cap == null) {
    return (
      <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-text-2">
        {used}
        <span className="font-semibold text-text-3">משתמשים · ללא הגבלה</span>
      </span>
    );
  }

  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 100;
  const tone = used >= cap ? "full" : pct >= 80 ? "warn" : "ok";

  return (
    <span className="block">
      <span className="mb-1 flex items-baseline gap-1 text-[12.5px] font-bold tabular-nums text-text-2">
        {used}
        <span className="text-text-3">/ {cap}</span>
        {used >= cap && <span className="text-[11px] font-bold text-danger">· מלא</span>}
      </span>
      <span className="seat-meter block">
        <span className="seat-meter-fill block" data-tone={tone} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
