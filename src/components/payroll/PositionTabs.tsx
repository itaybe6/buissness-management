import { Icon } from "@/components/ui";
import { positionLabel } from "@/lib/employeePositions";
import type { EmployeePosition } from "@/types/database";

/**
 * Segmented filter for an employee who holds several positions:
 * "הכל" plus one chip per position. Hidden for single-position employees.
 */
export function PositionTabs({
  positions,
  value,
  onChange,
  deptName,
  className = "",
}: {
  positions: EmployeePosition[];
  /** Selected position id, or null for all. */
  value: string | null;
  onChange: (id: string | null) => void;
  deptName?: (id: string) => string | null | undefined;
  className?: string;
}) {
  if (positions.length <= 1) return null;
  const options: { id: string | null; label: string; icon: string }[] = [
    { id: null, label: "הכל", icon: "select_all" },
    ...positions.map((p) => ({
      id: p.id,
      label: positionLabel(p, deptName),
      icon: p.wage_type === "tips" ? "savings" : "schedule",
    })),
  ];
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} role="tablist" aria-label="סינון לפי תפקיד">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id ?? "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`btn-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition ${
              active
                ? "border-transparent bg-text text-surface"
                : "border-border bg-surface text-text-2 hover:bg-surface-2"
            }`}
          >
            <Icon name={o.icon} size={15} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
