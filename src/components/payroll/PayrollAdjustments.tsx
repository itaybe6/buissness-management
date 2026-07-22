import { useEffect, useState } from "react";
import { Button, Field, Icon, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/db";
import { useUpsertPayrollMonthAdjustment } from "@/api/payroll";

export interface PayrollAdjustmentValues {
  monthlyBonus: number;
  advance: number;
  differences: number;
}

export const EMPTY_ADJUSTMENTS: PayrollAdjustmentValues = {
  monthlyBonus: 0,
  advance: 0,
  differences: 0,
};

type FieldKey = keyof PayrollAdjustmentValues;

export const ADJUSTMENT_FIELDS: { key: FieldKey; label: string; hint: string; icon: string }[] = [
  { key: "monthlyBonus", label: "בונוס חודשי", hint: "מתווסף לסה״כ לתשלום", icon: "card_giftcard" },
  { key: "advance", label: "מפרעה", hint: "מנוכה מהסה״כ לתשלום", icon: "account_balance" },
  { key: "differences", label: "הפרשים", hint: "תיקון לפני תשלום — זיכוי או חיוב", icon: "swap_vert" },
];

export function hasAnyAdjustment(v: PayrollAdjustmentValues): boolean {
  return v.monthlyBonus !== 0 || v.advance !== 0 || v.differences !== 0;
}

export function adjustedTotal(grossPay: number, v: PayrollAdjustmentValues): number {
  return grossPay + v.monthlyBonus + v.differences - Math.max(0, v.advance);
}

/** Table/summary text for one adjustment. Advance always reads as a deduction. */
export function formatAdjustment(key: FieldKey, value: number): string {
  if (!value) return "—";
  if (key === "advance") return `−${formatCurrency(Math.abs(value))}`;
  if (key === "differences" && value < 0) return `−${formatCurrency(Math.abs(value))}`;
  return formatCurrency(Math.abs(value));
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function parseMagnitude(raw: string): number {
  const t = raw.trim().replace(",", ".");
  if (!t) return 0;
  const n = Math.abs(Number(t));
  return Number.isFinite(n) ? n : 0;
}

function draftOf(n: number): string {
  return n ? String(Math.abs(n)) : "";
}

function MoneyInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  return (
    <span className="pay-adj-money block">
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={value}
        // Digits only — the sign is a separate control, never typed.
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
      />
      <span className="pay-adj-money-cur" aria-hidden="true">
        ₪
      </span>
    </span>
  );
}

/** Read-only recap of the three adjustments (EmployeePayrollDetail panel). */
export function PayrollAdjustmentSummary({ values }: { values: PayrollAdjustmentValues }) {
  return (
    <div className="payroll-adj-grid">
      {ADJUSTMENT_FIELDS.map((f) => (
        <div key={f.key} className="pay-adj-item" data-empty={values[f.key] ? "false" : "true"}>
          <span className="pay-adj-item-label">
            <Icon name={f.icon} size={15} />
            {f.label}
          </span>
          <span className="pay-adj-item-value">{formatAdjustment(f.key, values[f.key])}</span>
        </div>
      ))}
    </div>
  );
}

/** The single place adjustments are edited. Explicit save — no autosave. */
export function PayrollAdjustmentsDialog({
  open,
  onClose,
  businessId,
  employeeId,
  employeeName,
  month,
  values,
  grossPay,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string | null;
  employeeId: string;
  employeeName: string | null;
  month: string;
  values: PayrollAdjustmentValues;
  grossPay: number;
}) {
  const { profile } = useAuth();
  const upsert = useUpsertPayrollMonthAdjustment(businessId);

  const [drafts, setDrafts] = useState<Record<FieldKey, string>>({
    monthlyBonus: "",
    advance: "",
    differences: "",
  });
  const [diffNegative, setDiffNegative] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to the stored values every time the dialog is opened.
  useEffect(() => {
    if (!open) return;
    setDrafts({
      monthlyBonus: draftOf(values.monthlyBonus),
      advance: draftOf(values.advance),
      differences: draftOf(values.differences),
    });
    setDiffNegative(values.differences < 0);
    setError(null);
  }, [open, values.monthlyBonus, values.advance, values.differences]);

  const next: PayrollAdjustmentValues = {
    monthlyBonus: parseMagnitude(drafts.monthlyBonus),
    advance: parseMagnitude(drafts.advance),
    differences: diffNegative ? -parseMagnitude(drafts.differences) : parseMagnitude(drafts.differences),
  };

  const wasTotal = adjustedTotal(grossPay, values);
  const nextTotal = adjustedTotal(grossPay, next);
  const changed =
    next.monthlyBonus !== values.monthlyBonus ||
    next.advance !== values.advance ||
    next.differences !== values.differences;

  const save = () => {
    if (!businessId) return;
    setError(null);
    upsert.mutate(
      {
        employee_id: employeeId,
        period_month: month,
        monthly_bonus: next.monthlyBonus,
        advance: next.advance,
        differences: next.differences,
        updated_by: profile?.id ?? null,
      },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(e instanceof Error ? e.message : "השמירה נכשלה, נסי שוב"),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="tune"
      title="התאמות שכר"
      subtitle={`${employeeName ?? "עובד"} · ${monthLabel(month)}`}
      maxWidth={440}
      footer={
        <>
          <Button onClick={save} loading={upsert.isPending} disabled={!changed} className="flex-1">
            שמירה
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={upsert.isPending}>
            ביטול
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="בונוס חודשי">
          <MoneyInput
            id="adj-bonus"
            value={drafts.monthlyBonus}
            onChange={(v) => setDrafts((d) => ({ ...d, monthlyBonus: v }))}
          />
          <span className="pay-adj-hint">מתווסף לסה״כ לתשלום</span>
        </Field>

        <Field label="מפרעה">
          <MoneyInput
            id="adj-advance"
            value={drafts.advance}
            onChange={(v) => setDrafts((d) => ({ ...d, advance: v }))}
          />
          <span className="pay-adj-hint">מנוכה מהסה״כ לתשלום</span>
        </Field>

        <Field label="הפרשים">
          <div className="flex items-start gap-2">
            <div className="pay-adj-sign-switch" role="group" aria-label="סוג ההפרש">
              <button
                type="button"
                className="pay-adj-sign-btn"
                aria-pressed={!diffNegative}
                onClick={() => setDiffNegative(false)}
              >
                + זיכוי
              </button>
              <button
                type="button"
                className="pay-adj-sign-btn"
                aria-pressed={diffNegative}
                onClick={() => setDiffNegative(true)}
              >
                − חיוב
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <MoneyInput
                id="adj-diff"
                value={drafts.differences}
                onChange={(v) => setDrafts((d) => ({ ...d, differences: v }))}
              />
            </div>
          </div>
          <span className="pay-adj-hint">תיקון לפני תשלום — זיכוי מוסיף, חיוב מנכה</span>
        </Field>

        <div className="pay-adj-preview">
          <span className="pay-adj-preview-label">סה״כ לתשלום</span>
          <span className="pay-adj-preview-nums">
            {nextTotal !== wasTotal && (
              <span className="pay-adj-preview-was">{formatCurrency(wasTotal)}</span>
            )}
            <span className="pay-adj-preview-value">{formatCurrency(nextTotal)}</span>
          </span>
        </div>

        {error && <p className="text-[12.5px] font-semibold text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
