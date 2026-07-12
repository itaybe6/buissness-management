import { Badge, Card, EmptyState, Icon } from "@/components/ui";
import { StaggerGrid, StaggerItem } from "@/components/motion/shared-motion";
import { formatCurrency } from "@/lib/db";
import {
  fmtHours,
  HE_DAYS_SHORT,
  monthLabel,
  monthNow,
  shiftMonth,
  type ShiftRow,
  type ShiftRowTotals,
} from "@/lib/payrollShiftRows";
import type { WageType } from "@/types/database";

export function MonthStepper({
  label,
  onPrev,
  onNext,
  nextDisabled,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="flex flex-none items-center gap-1 rounded-[13px] border border-border bg-surface p-1 shadow-sm">
      <StepBtn icon="chevron_right" label="חודש קודם" onClick={onPrev} />
      <span className="min-w-[92px] select-none text-center text-[13px] font-bold tabular-nums text-text">{label}</span>
      <StepBtn icon="chevron_left" label="חודש הבא" onClick={onNext} disabled={nextDisabled} />
    </div>
  );
}

function StepBtn({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="btn-press grid h-8 w-8 place-items-center rounded-[10px] text-text-2 transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30"
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

export function ShiftBreakdownSummary({
  isTips,
  wageLabel,
  bonusPct,
  totals,
  rate,
}: {
  isTips: boolean;
  wageLabel: string;
  bonusPct: number;
  totals: ShiftRowTotals;
  rate: number;
}) {
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-border/70 bg-surface shadow-[0_18px_44px_-18px_rgba(15,23,20,0.16)]">
      <div className="px-5 pb-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-text-3">סה״כ לחודש</p>
            <div className="mt-1 text-[clamp(2rem,8vw,2.8rem)] font-extrabold leading-none tracking-tight tabular-nums text-text">
              {formatCurrency(totals.earned)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone={isTips ? "violet" : "success"} className="flex-none">
              <Icon name={isTips ? "savings" : "schedule"} size={14} />
              {wageLabel}
            </Badge>
            {bonusPct > 0 && (
              <Badge tone="neutral" className="flex-none">
                <Icon name="percent" size={14} />
                {bonusPct}% קופה
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <HeroStat icon="event_available" value={String(totals.count)} label="משמרות" />
          <HeroStat icon="timer" value={fmtHours(totals.hours)} label="שעות" />
          <HeroStat
            icon="trending_up"
            value={formatCurrency(isTips ? totals.avg : rate)}
            label={isTips ? "ממוצע לשעה" : "תעריף לשעה"}
          />
        </div>

        {(isTips && (totals.tips > 0 || totals.topup > 0)) || totals.bonus > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[13px] border border-border-2 bg-surface-2 px-3.5 py-2.5 text-[12.5px]">
            {isTips && totals.tips > 0 && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-text-2">
                <span className="h-2 w-2 rounded-full bg-accent-2" />
                טיפים <span className="font-bold tabular-nums text-text">{formatCurrency(totals.tips)}</span>
              </span>
            )}
            {isTips && totals.topup > 0.5 && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-text-2">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--info)" }} />
                השלמה למינימום <span className="font-bold tabular-nums text-text">{formatCurrency(totals.topup)}</span>
              </span>
            )}
            {!isTips && totals.earned - totals.bonus > 0 && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-text-2">
                <span className="h-2 w-2 rounded-full bg-success" />
                שכר שעתי <span className="font-bold tabular-nums text-text">{formatCurrency(totals.earned - totals.bonus)}</span>
              </span>
            )}
            {totals.bonus > 0 && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-text-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                תוספת מאחוז קופה <span className="font-bold tabular-nums text-text">{formatCurrency(totals.bonus)}</span>
              </span>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HeroStat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="rounded-[14px] border border-border-2 bg-surface-2 px-3 py-2.5">
      <Icon name={icon} size={17} className="text-text-3" />
      <div className="mt-1 text-[17px] font-extrabold leading-none tabular-nums text-text">{value}</div>
      <div className="mt-1 text-[11px] font-medium text-text-3">{label}</div>
    </div>
  );
}

export function ShiftCard({ row }: { row: ShiftRow }) {
  const day = row.date.getDate();
  const weekday = HE_DAYS_SHORT[row.date.getDay()];

  return (
    <Card className="flex items-stretch gap-3 p-3 hover:border-border hover:shadow-md sm:gap-3.5 sm:p-3.5">
      <div className="flex w-[52px] flex-none flex-col items-center justify-center rounded-[14px] bg-surface-2 py-1.5 sm:w-[58px]">
        <span className="text-[10.5px] font-bold text-text-3">{weekday}</span>
        <span className="text-[22px] font-extrabold leading-none tabular-nums text-text sm:text-[24px]">{day}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-bold text-text">{row.title}</span>
          {row.belowMin && (
            <Badge tone="info" className="flex-none">
              <Icon name="add_card" size={12} />
              הושלם למינימום
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-text-3">
          {row.timeLabel && (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Icon name="schedule" size={13} />
              {row.timeLabel}
            </span>
          )}
          {row.hours > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
              <Icon name="timer" size={13} />
              {fmtHours(row.hours)} ש׳
            </span>
          )}
          {row.isTips && row.tipAmount != null && (
            <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-accent-2">
              <Icon name="savings" size={13} />
              {formatCurrency(row.tipAmount)}
            </span>
          )}
          {row.bonusAmount != null && row.bonusAmount > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-accent">
              <Icon name="percent" size={13} />
              {formatCurrency(row.bonusAmount)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-none flex-col items-end justify-center text-left">
        <span className="text-[18px] font-extrabold leading-none tabular-nums text-text sm:text-[19px]">
          {formatCurrency(row.earned)}
        </span>
        {row.hours > 0 && (
          <span className="mt-1 text-[11px] font-semibold tabular-nums text-text-3">
            {formatCurrency(row.hourly)}/ש׳
          </span>
        )}
      </div>
    </Card>
  );
}

export function ShiftBreakdownList({
  rows,
  isTips,
}: {
  rows: ShiftRow[];
  isTips: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-5">
        <EmptyState
          icon="event_busy"
          title="אין משמרות החודש"
          description={
            isTips
              ? "ברגע שיוזנו טיפים על משמרות שביצע העובד, הן יופיעו כאן עם החישוב."
              : "ברגע שיירשמו שעות נוכחות על משמרות החודש, הן יופיעו כאן עם השכר."
          }
        />
      </div>
    );
  }

  return (
    <StaggerGrid className="mt-5 flex flex-col gap-2.5" stagger={0.045}>
      {rows.map((r) => (
        <StaggerItem key={r.id}>
          <ShiftCard row={r} />
        </StaggerItem>
      ))}
    </StaggerGrid>
  );
}

export function useMonthStepper(month: string, onMonthChange: (m: string) => void) {
  const atCurrentMonth = month >= monthNow();
  return {
    label: monthLabel(month),
    atCurrentMonth,
    onPrev: () => onMonthChange(shiftMonth(month, -1)),
    onNext: () => onMonthChange(shiftMonth(month, 1)),
  };
}

export type { ShiftRow, ShiftRowTotals, WageType };
