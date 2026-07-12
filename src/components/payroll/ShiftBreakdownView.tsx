import { Badge, Card, EmptyState, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { StaggerGrid, StaggerItem } from "@/components/motion/shared-motion";
import { formatCurrency } from "@/lib/db";
import {
  fmtHours,
  HE_DAYS_SHORT,
  monthLabel,
  monthNow,
  shiftFullDateLabel,
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

type MonthStepperState = {
  label: string;
  atCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export function ShiftBreakdownSummary({
  isTips,
  wageLabel,
  bonusPct,
  totals,
  rate,
  stepper,
}: {
  isTips: boolean;
  wageLabel: string;
  bonusPct: number;
  totals: ShiftRowTotals;
  rate: number;
  stepper?: MonthStepperState;
}) {
  return (
    <>
      {/* ── Mobile — wallet hero ── */}
      <section className="payroll-hero md:hidden">
        <div className="payroll-hero-top">
          {stepper ? (
            <div className="payroll-month-nav">
              <button
                type="button"
                className="payroll-month-btn"
                aria-label="חודש קודם"
                onClick={stepper.onPrev}
              >
                <Icon name="chevron_right" size={20} />
              </button>
              <span className="payroll-month-label">{stepper.label}</span>
              <button
                type="button"
                className="payroll-month-btn"
                aria-label="חודש הבא"
                onClick={stepper.onNext}
                disabled={stepper.atCurrentMonth}
              >
                <Icon name="chevron_left" size={20} />
              </button>
            </div>
          ) : (
            <span />
          )}
          <span className="shifts-hero-badge">
            <Icon name={isTips ? "savings" : "schedule"} size={14} />
            {wageLabel}
            {bonusPct > 0 && ` · ${bonusPct}% קופה`}
          </span>
        </div>
        <span className="payroll-hero-label">סה״כ לחודש</span>
        <div className="payroll-hero-total">{formatCurrency(totals.earned)}</div>
        <div className="payroll-hero-chips">
          <span className="payroll-hero-chip">
            <Icon name="event_available" size={15} />
            {totals.count} משמרות
          </span>
          <span className="payroll-hero-chip">
            <Icon name="timer" size={15} />
            {fmtHours(totals.hours)} שעות
          </span>
          <span className="payroll-hero-chip">
            <Icon name="trending_up" size={15} />
            {formatCurrency(isTips ? totals.avg : rate)} לשעה
          </span>
        </div>
        {((isTips && (totals.tips > 0 || totals.topup > 0.5)) || totals.bonus > 0) && (
          <div className="payroll-hero-chips">
            {isTips && totals.tips > 0 && (
              <span className="payroll-hero-chip">
                <span className="hero-chip-dot" style={{ background: "var(--brand-200)" }} />
                טיפים {formatCurrency(totals.tips)}
              </span>
            )}
            {isTips && totals.topup > 0.5 && (
              <span className="payroll-hero-chip">
                <span className="hero-chip-dot" style={{ background: "var(--info)" }} />
                השלמה {formatCurrency(totals.topup)}
              </span>
            )}
            {totals.bonus > 0 && (
              <span className="payroll-hero-chip">
                <span className="hero-chip-dot" style={{ background: "var(--success)" }} />
                תוספת קופה {formatCurrency(totals.bonus)}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Desktop — light summary card ── */}
      <section className="relative hidden overflow-hidden rounded-[22px] border border-border/70 bg-surface shadow-[0_18px_44px_-18px_rgba(15,23,20,0.16)] md:block">
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
    </>
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

export function ShiftCard({ row, interactive }: { row: ShiftRow; interactive?: boolean }) {
  const day = row.date.getDate();
  const weekday = HE_DAYS_SHORT[row.date.getDay()];

  return (
    <Card
      className={`flex items-stretch gap-3 p-3 sm:gap-3.5 sm:p-3.5 ${
        interactive ? "cursor-pointer hover:border-border hover:shadow-md active:scale-[0.995]" : "hover:border-border hover:shadow-md"
      }`}
    >
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

function ShiftDetailRow({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: "default" | "accent" | "accent2" | "info" | "success";
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "accent2"
        ? "text-accent-2"
        : tone === "info"
          ? "text-info"
          : tone === "success"
            ? "text-success"
            : "text-text";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border-2 bg-surface-2 px-3.5 py-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-semibold text-text-2">
        <Icon name={icon} size={17} className="flex-none text-text-3" />
        {label}
      </span>
      <span className={`shrink-0 text-[14px] font-extrabold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

export function ShiftDetailModal({
  row,
  onClose,
  isTips,
  rate,
}: {
  row: ShiftRow | null;
  onClose: () => void;
  isTips: boolean;
  rate: number;
}) {
  if (!row) return null;

  const hourlyRate = row.hours > 0 ? row.hourly : rate;

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      icon={isTips ? "savings" : "schedule"}
      title={row.title}
      subtitle={shiftFullDateLabel(row.date)}
      maxWidth={420}
    >
      <div className="flex flex-col gap-2">
        {row.timeLabel && <ShiftDetailRow label="שעות עבודה" value={row.timeLabel} icon="schedule" />}
        {row.hours > 0 && <ShiftDetailRow label="משך משמרת" value={`${fmtHours(row.hours)} שעות`} icon="timer" />}
        {row.hours > 0 && (
          <ShiftDetailRow
            label={isTips ? "תעריף מחושב לשעה" : "תעריף לשעה"}
            value={`${formatCurrency(hourlyRate)}/ש׳`}
            icon="trending_up"
          />
        )}
        {row.isTips && row.tipAmount != null && row.tipAmount > 0 && (
          <ShiftDetailRow label="טיפים" value={formatCurrency(row.tipAmount)} icon="savings" tone="accent2" />
        )}
        {row.isTips && (row.topup ?? 0) > 0.5 && (
          <ShiftDetailRow label="השלמה למינימום" value={formatCurrency(row.topup!)} icon="add_card" tone="info" />
        )}
        {!row.isTips && row.hours > 0 && (
          <ShiftDetailRow
            label="שכר שעתי"
            value={formatCurrency(row.earned - (row.bonusAmount ?? 0))}
            icon="payments"
          />
        )}
        {row.bonusAmount != null && row.bonusAmount > 0 && (
          <ShiftDetailRow label="תוספת מאחוז קופה" value={formatCurrency(row.bonusAmount)} icon="percent" tone="accent" />
        )}
        {row.belowMin && (
          <div className="flex items-center gap-2 rounded-[12px] border border-info/25 bg-info-bg px-3.5 py-2.5 text-[12.5px] font-semibold text-info">
            <Icon name="info" size={16} />
            השכר חושב לפי מינימום שעתי — הטיפים היו נמוכים מהסף
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-3.5 py-3.5 shadow-sm">
          <span className="text-[13.5px] font-bold text-text-2">סה״כ למשמרת</span>
          <span className="text-[22px] font-extrabold leading-none tabular-nums text-text">{formatCurrency(row.earned)}</span>
        </div>
      </div>
    </Modal>
  );
}

export function ShiftBreakdownList({
  rows,
  isTips,
  onRowClick,
}: {
  rows: ShiftRow[];
  isTips: boolean;
  onRowClick?: (row: ShiftRow) => void;
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
    <>
      {/* ── Mobile — grouped app-style feed ── */}
      <div className="users-roster mt-3 md:hidden">
        {rows.map((r, i) => {
          const isToday = r.date.toDateString() === new Date().toDateString();
          const cell = (
            <>
              <span className="shift-cell-date" data-today={isToday}>
                <span className="shift-cell-wd">{HE_DAYS_SHORT[r.date.getDay()]}</span>
                <span className="shift-cell-day">{r.date.getDate()}</span>
              </span>
              <span className="user-cell-info">
                <span className="user-cell-name">{r.title}</span>
                <span className="shift-cell-meta">
                  {r.timeLabel && (
                    <span className="shift-meta-item">
                      <Icon name="schedule" size={13} />
                      {r.timeLabel}
                    </span>
                  )}
                  {r.hours > 0 && (
                    <span className="shift-meta-item">
                      <Icon name="timer" size={13} />
                      {fmtHours(r.hours)} ש׳
                    </span>
                  )}
                  {r.isTips && r.tipAmount != null && (
                    <span className="shift-meta-item shift-meta-item--tip">
                      <Icon name="savings" size={13} />
                      {formatCurrency(r.tipAmount)}
                    </span>
                  )}
                  {r.bonusAmount != null && r.bonusAmount > 0 && (
                    <span className="shift-meta-item shift-meta-item--bonus">
                      <Icon name="percent" size={13} />
                      {formatCurrency(r.bonusAmount)}
                    </span>
                  )}
                  {r.belowMin && <span className="shift-cell-flag">הושלם למינ׳</span>}
                </span>
              </span>
              <span className="pay-cell-total">
                <span className="pay-cell-sum">{formatCurrency(r.earned)}</span>
                {r.hours > 0 && <span className="pay-cell-hint">{formatCurrency(r.hourly)}/ש׳</span>}
              </span>
            </>
          );

          if (onRowClick) {
            return (
              <button
                key={r.id}
                type="button"
                className="shift-cell shift-cell--clickable"
                style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                onClick={() => onRowClick(r)}
                aria-label={`פרטי משמרת ${r.title}, ${formatCurrency(r.earned)}`}
              >
                {cell}
              </button>
            );
          }

          return (
            <div key={r.id} className="shift-cell" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
              {cell}
            </div>
          );
        })}
      </div>

      {/* ── Desktop — stagger cards ── */}
      <StaggerGrid className="mt-5 hidden flex-col gap-2.5 md:flex" stagger={0.045}>
        {rows.map((r) => (
          <StaggerItem key={r.id}>
            {onRowClick ? (
              <button
                type="button"
                className="block w-full text-right"
                onClick={() => onRowClick(r)}
                aria-label={`פרטי משמרת ${r.title}, ${formatCurrency(r.earned)}`}
              >
                <ShiftCard row={r} interactive />
              </button>
            ) : (
              <ShiftCard row={r} />
            )}
          </StaggerItem>
        ))}
      </StaggerGrid>
    </>
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
