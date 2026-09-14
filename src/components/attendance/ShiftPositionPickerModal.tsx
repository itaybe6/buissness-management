import { Icon } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { WAGE_TYPE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/db";
import { positionLabel } from "@/lib/employeePositions";
import type { EmployeePosition } from "@/types/database";

export interface ShiftPositionPickerProps {
  open: boolean;
  positions: EmployeePosition[];
  deptName: (id: string) => string | null | undefined;
  onPick: (position: EmployeePosition) => void;
  onClose: () => void;
  busy?: boolean;
  /** When set, the picker is for punching someone else in (manager flow). */
  employeeName?: string | null;
}

/**
 * "Entering as what?" — shown at clock-in for employees who hold more than one
 * position. The choice fixes the wage model for that shift.
 */
export function ShiftPositionPickerModal({
  open,
  positions,
  deptName,
  onPick,
  onClose,
  busy = false,
  employeeName,
}: ShiftPositionPickerProps) {
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      icon="badge"
      title="באיזה תפקיד נכנסים למשמרת?"
      subtitle={
        employeeName
          ? `${employeeName} — השכר למשמרת יחושב לפי התפקיד שנבחר`
          : "השכר למשמרת הזו יחושב לפי התפקיד שתבחרו"
      }
      maxWidth={420}
    >
      <div className="flex flex-col gap-2">
        {positions.map((p) => {
          const tips = p.wage_type === "tips";
          return (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(p)}
              className="btn-press flex w-full items-center gap-3 rounded-[14px] border border-border bg-surface px-3.5 py-3 text-right transition hover:border-accent-2 hover:bg-surface-2 disabled:opacity-60"
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px]"
                style={{
                  background: tips ? "var(--accent-tint)" : "var(--surface-2)",
                  color: tips ? "var(--accent-2)" : "var(--text-2)",
                }}
              >
                <Icon name={tips ? "savings" : "schedule"} size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-extrabold text-text">{positionLabel(p, deptName)}</span>
                <span className="block text-[12.5px] text-text-2">
                  {WAGE_TYPE_LABELS[p.wage_type]} ·{" "}
                  {tips ? `מינימום ${formatCurrency(Number(p.hourly_rate) || 0)}/שע׳` : `${formatCurrency(Number(p.hourly_rate) || 0)}/שע׳`}
                  {Number(p.bonus_pct) > 0 && ` · ${p.bonus_pct}% קופה`}
                </span>
              </span>
              <Icon name="chevron_left" size={20} className="shrink-0 text-text-3" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
