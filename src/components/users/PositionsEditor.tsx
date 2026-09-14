import { Icon, Input, Select } from "@/components/ui";
import { BONUS_ELIGIBLE_ROLES, DEFAULT_HOURLY_RATE, ROLE_LABELS, WAGE_TYPE_LABELS } from "@/lib/constants";
import { accessRoleForPositions, newPositionDraft, positionLabel, type PositionDraft } from "@/lib/employeePositions";
import type { UserRole, WageType } from "@/types/database";

interface Props {
  drafts: PositionDraft[];
  onChange: (next: PositionDraft[]) => void;
  /** Roles the current manager may assign. */
  roles: UserRole[];
  departments: { id: string; name: string }[];
}

/**
 * Editable list of an employee's positions. Each one is a permission + (for
 * plain employees) a department + its own pay model. The first/highest role
 * decides the login permission and is called out under the list.
 */
export function PositionsEditor({ drafts, onChange, roles, departments }: Props) {
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? null;

  function update(key: string, patch: Partial<PositionDraft>) {
    onChange(
      drafts.map((d) => {
        if (d.key !== key) return d;
        const next = { ...d, ...patch };
        if (next.role !== "employee") next.department_id = null;
        if (!BONUS_ELIGIBLE_ROLES.includes(next.role)) next.bonus_pct = "0";
        return next;
      }),
    );
  }

  function add() {
    const fallbackRole = roles.includes("employee") ? "employee" : roles[0] ?? "employee";
    onChange([...drafts, newPositionDraft({ role: fallbackRole, hourly_rate: String(DEFAULT_HOURLY_RATE) })]);
  }

  function remove(key: string) {
    if (drafts.length <= 1) return;
    onChange(drafts.filter((d) => d.key !== key));
  }

  const accessRole = accessRoleForPositions(drafts);

  return (
    <div className="flex flex-col gap-2.5">
      {drafts.map((d, i) => {
        const bonusEligible = BONUS_ELIGIBLE_ROLES.includes(d.role);
        const roleOptions = roles.includes(d.role) ? roles : [d.role, ...roles];
        return (
          <div key={d.key} className="rounded-[12px] border border-border bg-surface-2 p-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-bold text-text">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-surface text-[11px] text-text-2">
                  {i + 1}
                </span>
                <span className="truncate">{positionLabel(d, deptName)}</span>
                <span className="shrink-0 text-[11.5px] font-semibold text-text-3">
                  · {WAGE_TYPE_LABELS[d.wage_type]}
                </span>
              </span>
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(d.key)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-text-3 transition hover:[background:var(--danger-bg)] hover:text-danger"
                  aria-label="הסרת תפקיד"
                  title="הסרת תפקיד"
                >
                  <Icon name="close" size={17} />
                </button>
              )}
            </div>

            <div className={d.role === "employee" ? "grid grid-cols-2 gap-2.5" : undefined}>
              <label className="block">
                <span className="label-text">הרשאה</span>
                <Select
                  className="mt-1.5"
                  value={d.role}
                  onChange={(e) => update(d.key, { role: e.target.value as UserRole })}
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
              </label>
              {d.role === "employee" && (
                <label className="block">
                  <span className="label-text">מחלקה</span>
                  <Select
                    className="mt-1.5"
                    value={d.department_id ?? ""}
                    onChange={(e) => update(d.key, { department_id: e.target.value || null })}
                  >
                    <option value="">— ללא —</option>
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>{dep.name}</option>
                    ))}
                  </Select>
                </label>
              )}
            </div>

            <div className={`mt-2.5 grid gap-2.5 ${bonusEligible ? "grid-cols-3" : "grid-cols-2"}`}>
              <label className="block">
                <span className="label-text">סוג שכר</span>
                <Select
                  className="mt-1.5"
                  value={d.wage_type}
                  onChange={(e) => update(d.key, { wage_type: e.target.value as WageType })}
                >
                  {(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => (
                    <option key={w} value={w}>{WAGE_TYPE_LABELS[w]}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="label-text">{d.wage_type === "tips" ? "מינימום לשעה (₪)" : "שכר שעתי (₪)"}</span>
                <Input
                  className="mt-1.5"
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  min={0}
                  value={d.hourly_rate}
                  onChange={(e) => update(d.key, { hourly_rate: e.target.value })}
                  placeholder={String(DEFAULT_HOURLY_RATE)}
                />
              </label>
              {bonusEligible && (
                <label className="block">
                  <span className="label-text">% מהקופה</span>
                  <Input
                    className="mt-1.5"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.1}
                    value={d.bonus_pct}
                    onChange={(e) => update(d.key, { bonus_pct: e.target.value })}
                    placeholder="0"
                  />
                </label>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex items-center justify-center gap-1.5 rounded-[11px] border border-dashed border-border px-3 py-2.5 text-[13px] font-bold text-accent-2 transition hover:bg-surface-2"
      >
        <Icon name="add" size={18} />
        הוספת תפקיד נוסף
      </button>

      <p className="text-[12px] leading-relaxed text-text-2">
        {drafts.length > 1 ? (
          <>
            בהחתמת כניסה העובד יבחר באיזה תפקיד הוא נכנס, והשכר לאותה משמרת יחושב לפי התפקיד שנבחר.
            הרשאת הגישה למערכת: <strong className="text-text">{ROLE_LABELS[accessRole]}</strong>.
          </>
        ) : (
          <>אפשר להוסיף תפקיד נוסף — למשל אחראי משמרת בשכר שעתי וגם מלצר על טיפים.</>
        )}
      </p>
    </div>
  );
}
