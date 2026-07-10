import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, Icon, PageLoader, ErrorState } from "@/components/ui";
import { StaggerGrid, StaggerItem } from "@/components/motion/shared-motion";
import { useAuth } from "@/lib/auth";
import { WAGE_TYPE_LABELS } from "@/lib/constants";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { useEmployeeAttendanceMonth } from "@/api/attendance";
import { useEmployeeTips, useEmployeeBonuses } from "@/api/payroll";
import { useShiftTemplates } from "@/api/shifts";
import type { ShiftTemplate } from "@/types/database";

const HE_DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const HE_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(m: string, delta: number) {
  const d = new Date(m + "-01T12:00:00");
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
}

function monthLabel(m: string) {
  const d = new Date(m + "-01T12:00:00");
  return `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function fmtHours(h: number) {
  // "7.5 שעות" but trim trailing .0
  const v = Math.round(h * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** One normalized shift row, regardless of wage model. */
interface ShiftRow {
  id: string;
  date: Date;
  title: string;
  timeLabel: string | null;
  hours: number;
  hourly: number;
  earned: number;
  // tips-only
  isTips: boolean;
  tipAmount?: number;
  topup?: number;
  belowMin?: boolean;
  bonusAmount?: number;
}

export function MyShifts() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const [month, setMonth] = useState(monthNow());

  const wageType = profile?.wage_type ?? "hourly";
  const isTips = wageType === "tips";
  const rate = Number(profile?.hourly_rate ?? 0);

  const attendanceQ = useEmployeeAttendanceMonth(businessId, !isTips ? profile?.id : null, month);
  const tipsQ = useEmployeeTips(businessId, isTips ? profile?.id : null, month);
  const bonusesQ = useEmployeeBonuses(businessId, profile?.id, month);
  const { data: templates } = useShiftTemplates(businessId);

  const activeQ = isTips ? tipsQ : attendanceQ;
  const isLoading = activeQ.isLoading || bonusesQ.isLoading;
  const isError = activeQ.isError || bonusesQ.isError;
  const refetch = () => {
    activeQ.refetch();
    bonusesQ.refetch();
  };

  const rows = useMemo<ShiftRow[]>(() => {
    const tplById = new Map((templates ?? []).map((t) => [t.id, t] as [string, ShiftTemplate]));
    const bonusKey = (date: string, templateId: string | null) => `${date}|${templateId ?? ""}`;
    const bonusesByShift = new Map(
      (bonusesQ.data ?? []).map((b) => [bonusKey(b.shift_date, b.shift_template_id), b]),
    );
    const usedBonusKeys = new Set<string>();

    const mergeBonus = (row: ShiftRow, dateISO: string, templateId: string | null | undefined): ShiftRow => {
      const key = bonusKey(dateISO, templateId ?? null);
      const bonus = bonusesByShift.get(key);
      if (!bonus) return row;
      usedBonusKeys.add(key);
      const bonusAmount = Number(bonus.amount) || 0;
      return {
        ...row,
        earned: row.earned + bonusAmount,
        bonusAmount: (row.bonusAmount ?? 0) + bonusAmount,
      };
    };

    let baseRows: ShiftRow[];

    if (isTips) {
      baseRows = (tipsQ.data ?? [])
        .map((t): ShiftRow => {
          const hours = Number(t.hours) || 0;
          const tipAmount = Number(t.amount) || 0;
          const fromTips = t.hourly_from_tips != null ? Number(t.hourly_from_tips) : hours ? tipAmount / hours : 0;
          const hourly = Math.max(fromTips, rate);
          const earned = hours * hourly;
          const topup = Math.max(0, earned - tipAmount);
          const tpl = t.shift_template_id ? tplById.get(t.shift_template_id) : undefined;
          return mergeBonus(
            {
              id: t.id,
              date: new Date(t.shift_date + "T00:00:00"),
              title: tpl?.name ?? "משמרת",
              timeLabel: tpl ? `${tpl.start_time?.slice(0, 5)}–${tpl.end_time?.slice(0, 5)}` : null,
              hours,
              hourly,
              earned,
              isTips: true,
              tipAmount,
              topup,
              belowMin: topup > 0.5,
            },
            t.shift_date,
            t.shift_template_id,
          );
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    } else {
      baseRows = (attendanceQ.data ?? [])
        .filter((a) => a.clock_in && a.clock_out)
        .map((a): ShiftRow => {
          const hours = (new Date(a.clock_out!).getTime() - new Date(a.clock_in!).getTime()) / 3.6e6;
          return {
            id: a.id,
            date: new Date(a.clock_in!),
            title: "משמרת",
            timeLabel: `${hhmm(a.clock_in!)}–${hhmm(a.clock_out!)}`,
            hours,
            hourly: rate,
            earned: hours * rate,
            isTips: false,
          };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    }

    const bonusOnlyRows: ShiftRow[] = (bonusesQ.data ?? [])
      .filter((b) => !usedBonusKeys.has(bonusKey(b.shift_date, b.shift_template_id)))
      .map((b): ShiftRow => {
        const tpl = b.shift_template_id ? tplById.get(b.shift_template_id) : undefined;
        const bonusAmount = Number(b.amount) || 0;
        return {
          id: `bonus-${b.id}`,
          date: new Date(b.shift_date + "T00:00:00"),
          title: tpl?.name ?? "תוספת שכר",
          timeLabel: tpl ? `${tpl.start_time?.slice(0, 5)}–${tpl.end_time?.slice(0, 5)}` : null,
          hours: 0,
          hourly: 0,
          earned: bonusAmount,
          isTips: false,
          bonusAmount,
        };
      });

    return [...baseRows, ...bonusOnlyRows].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [isTips, tipsQ.data, attendanceQ.data, bonusesQ.data, templates, rate]);

  const totals = useMemo(() => {
    const hours = rows.reduce((s, r) => s + r.hours, 0);
    const earned = rows.reduce((s, r) => s + r.earned, 0);
    const tips = rows.reduce((s, r) => s + (r.tipAmount ?? 0), 0);
    const topup = rows.reduce((s, r) => s + (r.topup ?? 0), 0);
    const bonus = rows.reduce((s, r) => s + (r.bonusAmount ?? 0), 0);
    return { hours, earned, tips, topup, bonus, count: rows.length, avg: hours > 0 ? earned / hours : 0 };
  }, [rows]);

  const atCurrentMonth = month >= monthNow();

  return (
    <div className="w-full animate-fadeUp">
      {/* Header + month stepper */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="hidden min-w-0 md:block">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-text-3">השכר שלי</p>
          <h1 className="mt-0.5 text-[clamp(1.4rem,5vw,1.9rem)] font-extrabold leading-none tracking-tight text-text">
            המשמרות שלי
          </h1>
        </div>
        <MonthStepper
          label={monthLabel(month)}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => shiftMonth(m, 1))}
          nextDisabled={atCurrentMonth}
        />
      </header>

      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <SummaryHero isTips={isTips} wageLabel={WAGE_TYPE_LABELS[wageType]} totals={totals} rate={rate} />

          {rows.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                icon="event_busy"
                title="אין משמרות החודש"
                description={
                  isTips
                    ? "ברגע שיוזנו טיפים על משמרות שביצעת, הן יופיעו כאן עם החישוב."
                    : "ברגע שתחתים נוכחות על משמרות החודש, הן יופיעו כאן עם השכר."
                }
              />
            </div>
          ) : (
            <StaggerGrid className="mt-5 flex flex-col gap-2.5" stagger={0.045}>
              {rows.map((r) => (
                <StaggerItem key={r.id}>
                  <ShiftCard row={r} />
                </StaggerItem>
              ))}
            </StaggerGrid>
          )}
        </>
      )}
    </div>
  );
}

function MonthStepper({
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
      {/* In RTL, the "previous" (older) month sits on the right → use the right-pointing chevron */}
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

function SummaryHero({
  isTips,
  wageLabel,
  totals,
  rate,
}: {
  isTips: boolean;
  wageLabel: string;
  totals: { hours: number; earned: number; tips: number; topup: number; bonus: number; count: number; avg: number };
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
          <Badge tone={isTips ? "violet" : "success"} className="mt-1 flex-none">
            <Icon name={isTips ? "savings" : "schedule"} size={14} />
            {wageLabel}
          </Badge>
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

function ShiftCard({ row }: { row: ShiftRow }) {
  const day = row.date.getDate();
  const weekday = HE_DAYS_SHORT[row.date.getDay()];

  return (
    <Card className="flex items-stretch gap-3 p-3 hover:border-border hover:shadow-md sm:gap-3.5 sm:p-3.5">
      {/* Date tile (visual start / right in RTL) */}
      <div className="flex w-[52px] flex-none flex-col items-center justify-center rounded-[14px] bg-surface-2 py-1.5 sm:w-[58px]">
        <span className="text-[10.5px] font-bold text-text-3">{weekday}</span>
        <span className="text-[22px] font-extrabold leading-none tabular-nums text-text sm:text-[24px]">{day}</span>
      </div>

      {/* Middle: title + meta */}
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
          <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
            <Icon name="timer" size={13} />
            {fmtHours(row.hours)} ש׳
          </span>
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

      {/* End (visual left in RTL): earnings */}
      <div className="flex flex-none flex-col items-end justify-center text-left">
        <span className="text-[18px] font-extrabold leading-none tabular-nums text-text sm:text-[19px]">
          {formatCurrency(row.earned)}
        </span>
        <span className="mt-1 text-[11px] font-semibold tabular-nums text-text-3">
          {formatCurrency(row.hourly)}/ש׳
        </span>
      </div>
    </Card>
  );
}
