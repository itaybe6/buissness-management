import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/db";
import { useUpsertPayrollMonthAdjustment } from "@/api/payroll";

export interface PayrollAdjustmentValues {
  monthlyBonus: number;
  advance: number;
  differences: number;
}

type FieldKey = keyof PayrollAdjustmentValues;
type SaveState = "idle" | "saving" | "saved";

const FIELD_META: {
  key: FieldKey;
  label: string;
  hint: string;
  icon: string;
  /** "±" fields are sign-toggleable; the rest carry a fixed mark. */
  sign: "+" | "−" | "±";
}[] = [
  { key: "monthlyBonus", label: "בונוס חודשי", hint: "מתווסף לסה״כ", icon: "card_giftcard", sign: "+" },
  { key: "advance", label: "מפרעה", hint: "מנוכה מהסה״כ", icon: "account_balance", sign: "−" },
  { key: "differences", label: "הפרשים", hint: "תיקון + או −", icon: "swap_vert", sign: "±" },
];

type FieldMeta = (typeof FIELD_META)[number];

/** Digits only — the sign lives in the chip, never in the input. */
function parseMagnitude(raw: string): number {
  const t = raw.trim().replace(",", ".");
  if (!t) return 0;
  const n = Math.abs(Number(t));
  return Number.isFinite(n) ? n : 0;
}

function magnitudeDraft(n: number): string {
  return n ? String(Math.abs(n)) : "";
}

function toneOf(key: FieldKey, value: number): string {
  if (!value) return "neutral";
  if (key === "monthlyBonus") return "bonus";
  if (key === "advance") return "advance";
  return value < 0 ? "minus" : "plus";
}

function signGlyph(field: FieldMeta, value: number, negative: boolean): string {
  if (field.sign !== "±") return field.sign;
  return negative || value < 0 ? "−" : "+";
}

function PayrollAdjustmentField({
  field,
  value,
  draft,
  negative,
  canEdit,
  saveState,
  onChange,
  onToggleSign,
}: {
  field: FieldMeta;
  value: number;
  draft: string;
  negative: boolean;
  canEdit: boolean;
  saveState: SaveState;
  onChange: (key: FieldKey, raw: string) => void;
  onToggleSign: () => void;
}) {
  const tone = toneOf(field.key, value);
  const sign = signGlyph(field, value, negative);

  if (!canEdit) {
    return (
      <span className="pay-adj-ro" data-tone={tone}>
        {value ? `${sign}${formatCurrency(Math.abs(value))}` : "—"}
      </span>
    );
  }

  const signable = field.sign === "±";

  return (
    <span
      className="pay-adj"
      data-tone={tone}
      data-state={value ? "filled" : "empty"}
      data-save={saveState}
      onClick={(e) => e.stopPropagation()}
    >
      {signable ? (
        <button
          type="button"
          className="pay-adj-sign"
          aria-label={`${field.label} — החלפת סימן (${sign === "−" ? "מינוס" : "פלוס"})`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSign();
          }}
        >
          {sign}
        </button>
      ) : (
        <span className="pay-adj-sign" aria-hidden="true">
          {sign}
        </span>
      )}

      <input
        type="text"
        inputMode="decimal"
        className="pay-adj-input"
        aria-label={field.label}
        placeholder="—"
        value={draft}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => onChange(field.key, e.target.value)}
      />

      {saveState === "saved" ? (
        <Icon name="check" size={14} className="pay-adj-saved-mark" />
      ) : (
        <span className="pay-adj-cur" aria-hidden="true">
          ₪
        </span>
      )}

      <span className="pay-adj-status" />
    </span>
  );
}

/** Three inline cells for a payroll table row, or labelled cards in the detail view. */
export function PayrollAdjustmentCells({
  businessId,
  employeeId,
  month,
  values,
  canEdit,
  layout = "row",
}: {
  businessId: string | null;
  employeeId: string;
  month: string;
  values: PayrollAdjustmentValues;
  canEdit: boolean;
  layout?: "row" | "grid";
}) {
  const { profile } = useAuth();
  const upsert = useUpsertPayrollMonthAdjustment(businessId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True from the first keystroke until the write settles — blocks refetches
   *  from clobbering what the manager is currently typing. */
  const busy = useRef(false);

  const [local, setLocal] = useState(values);
  const [drafts, setDrafts] = useState<Record<FieldKey, string>>(() => ({
    monthlyBonus: magnitudeDraft(values.monthlyBonus),
    advance: magnitudeDraft(values.advance),
    differences: magnitudeDraft(values.differences),
  }));
  const [diffNegative, setDiffNegative] = useState(values.differences < 0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [activeField, setActiveField] = useState<FieldKey | null>(null);

  useEffect(() => {
    if (busy.current) return;
    setLocal(values);
    setDrafts({
      monthlyBonus: magnitudeDraft(values.monthlyBonus),
      advance: magnitudeDraft(values.advance),
      differences: magnitudeDraft(values.differences),
    });
    if (values.differences !== 0) setDiffNegative(values.differences < 0);
  }, [values.monthlyBonus, values.advance, values.differences]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const scheduleSave = (next: PayrollAdjustmentValues) => {
    if (!canEdit || !businessId) return;
    busy.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setSaveState("saving");
      upsert.mutate(
        {
          employee_id: employeeId,
          period_month: month,
          monthly_bonus: Math.max(0, next.monthlyBonus),
          advance: Math.max(0, next.advance),
          differences: next.differences,
          updated_by: profile?.id ?? null,
        },
        {
          onSettled: (_data, error) => {
            // A newer keystroke already queued another write — let it finish.
            if (timer.current) return;
            busy.current = false;
            if (error) {
              setSaveState("idle");
              return;
            }
            setSaveState("saved");
            if (savedTimer.current) clearTimeout(savedTimer.current);
            savedTimer.current = setTimeout(() => setSaveState("idle"), 1400);
          },
        },
      );
    }, 650);
  };

  const commit = (next: PayrollAdjustmentValues, key: FieldKey) => {
    setLocal(next);
    setActiveField(key);
    setSaveState("idle");
    scheduleSave(next);
  };

  const onFieldChange = (key: FieldKey, raw: string) => {
    // Digits only — the sign is a separate control, letters are never valid.
    const clean = raw.replace(/[^\d.,]/g, "");
    setDrafts((d) => ({ ...d, [key]: clean }));
    const magnitude = parseMagnitude(clean);
    commit(
      { ...local, [key]: key === "differences" && diffNegative ? -magnitude : magnitude },
      key,
    );
  };

  const toggleDiffSign = () => {
    const nextNegative = !diffNegative;
    setDiffNegative(nextNegative);
    const magnitude = parseMagnitude(drafts.differences);
    commit({ ...local, differences: nextNegative ? -magnitude : magnitude }, "differences");
  };

  const cells = FIELD_META.map((field) => (
    <PayrollAdjustmentField
      key={field.key}
      field={field}
      value={local[field.key]}
      draft={drafts[field.key]}
      negative={diffNegative}
      canEdit={canEdit}
      saveState={activeField === field.key ? saveState : "idle"}
      onChange={onFieldChange}
      onToggleSign={toggleDiffSign}
    />
  ));

  if (layout === "grid") {
    return (
      <div className="payroll-adj-grid">
        {FIELD_META.map((field, i) => (
          <div
            key={field.key}
            className="pay-adj-card"
            data-tone={toneOf(field.key, local[field.key])}
            data-state={local[field.key] ? "filled" : "empty"}
          >
            <div className="pay-adj-card-head">
              <span className="pay-adj-card-icon">
                <Icon name={field.icon} size={16} />
              </span>
              <span className="pay-adj-card-label">{field.label}</span>
            </div>
            {cells[i]}
            <span className="pay-adj-card-hint">{field.hint}</span>
          </div>
        ))}
      </div>
    );
  }

  return <>{cells}</>;
}
