import { Fragment, useMemo, useState } from "react";
import { Badge, Button, Field, Icon, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { ActiveModulesPanel } from "@/components/superadmin/ActiveModulesPanel";
import { PlanPicker } from "@/components/superadmin/PlanPicker";
import { useCreateBusiness } from "@/api/businesses";
import {
  MODULE_BY_KEY,
  PLAN_BY_ID,
  detectPlan,
  enabledKeysOf,
  featureStateForPlan,
  type FeatureState,
} from "@/lib/features";
import type { Business, BusinessPlan, FeatureKey } from "@/types/database";

const STEPS = [
  { id: 0, label: "פרטי העסק", icon: "storefront" },
  { id: 1, label: "חבילה ומודולים", icon: "widgets" },
  { id: 2, label: "מנהל המערכת", icon: "shield_person" },
] as const;

const DEFAULT_PLAN: Exclude<BusinessPlan, "custom"> = "growth";

export function CreateBusinessWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (biz: Business) => void;
}) {
  const create = useCreateBusiness();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // step 1
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  // step 2
  const [state, setState] = useState<FeatureState>(() => featureStateForPlan(DEFAULT_PLAN));
  const [seats, setSeats] = useState<string>(String(PLAN_BY_ID.get(DEFAULT_PLAN)?.suggestedSeats ?? ""));
  // step 3
  const [mgrName, setMgrName] = useState("");
  const [mgrEmail, setMgrEmail] = useState("");
  const [mgrPhone, setMgrPhone] = useState("");
  const [mgrPassword, setMgrPassword] = useState("");

  const plan = useMemo(() => detectPlan(state), [state]);
  const enabledSet = useMemo(() => new Set(enabledKeysOf(state)), [state]);

  function reset() {
    setStep(0);
    setError(null);
    setName("");
    setNotes("");
    setState(featureStateForPlan(DEFAULT_PLAN));
    setSeats(String(PLAN_BY_ID.get(DEFAULT_PLAN)?.suggestedSeats ?? ""));
    setMgrName("");
    setMgrEmail("");
    setMgrPhone("");
    setMgrPassword("");
  }

  function close() {
    onClose();
    reset();
  }

  function pickPlan(next: Exclude<BusinessPlan, "custom">) {
    setState(featureStateForPlan(next));
    const suggested = PLAN_BY_ID.get(next)?.suggestedSeats;
    setSeats(suggested == null ? "" : String(suggested));
  }

  function applyChanges(changes: { key: FeatureKey; enabled: boolean }[]) {
    setState((prev) => {
      const next = { ...prev };
      for (const c of changes) next[c.key] = c.enabled;
      return next;
    });
  }

  function next() {
    setError(null);
    if (step === 0) {
      if (!name.trim()) return setError("נא להזין שם עסק");
      return setStep(1);
    }
    if (step === 1) {
      if (enabledSet.size === 0) return setError("יש להפעיל לפחות מודול אחד");
      const cap = seats.trim() ? Number(seats) : null;
      if (cap != null && (!Number.isFinite(cap) || cap < 1)) return setError("מגבלת המשתמשים חייבת להיות מספר חיובי");
      return setStep(2);
    }
  }

  async function submit(withManager: boolean) {
    setError(null);
    if (withManager) {
      if (!mgrName.trim() || !mgrEmail.trim() || !mgrPassword) {
        return setError("נא למלא שם, אימייל וסיסמה למנהל המערכת");
      }
      if (mgrPassword.length < 6) return setError("הסיסמה חייבת להכיל לפחות 6 תווים");
    }

    const cap = seats.trim() ? Number(seats) : null;
    if (withManager && cap != null && cap < 1) return setError("מגבלת המשתמשים חייבת להיות לפחות 1");

    try {
      const biz = await create.mutateAsync({
        name: name.trim(),
        features: state,
        plan,
        max_users: cap,
        admin_notes: notes.trim() || null,
        manager: withManager
          ? {
              full_name: mgrName.trim(),
              email: mgrEmail.trim(),
              password: mgrPassword,
              phone: mgrPhone.trim() || undefined,
            }
          : undefined,
      });
      onCreated(biz);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה ביצירת העסק");
    }
  }

  const enabledModules = enabledKeysOf(state).map((k) => MODULE_BY_KEY.get(k)!);

  return (
    <Modal
      open={open}
      onClose={close}
      title="הקמת עסק חדש"
      subtitle="שלושה שלבים: פרטים, חבילת מודולים, ומנהל המערכת שיקים את שאר הצוות"
      icon="add_business"
      maxWidth={960}
      fullScreenMobile
      footer={
        <>
          {step > 0 ? (
            <Button variant="secondary" icon="arrow_forward" onClick={() => { setError(null); setStep(step - 1); }}>
              חזרה
            </Button>
          ) : (
            <Button variant="secondary" onClick={close}>ביטול</Button>
          )}
          {step < 2 ? (
            <Button className="flex-1" onClick={next}>
              המשך
            </Button>
          ) : (
            <>
              <Button variant="secondary" loading={create.isPending} onClick={() => submit(false)}>
                יצירה ללא מנהל
              </Button>
              <Button className="flex-1" icon="check" loading={create.isPending} onClick={() => submit(true)}>
                יצירת העסק והמנהל
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <Fragment key={s.id}>
            {i > 0 && <span className="wizard-step-line" aria-hidden />}
            <span className="wizard-step" data-state={step === s.id ? "active" : step > s.id ? "done" : "todo"}>
              <span className="wizard-step-num">{step > s.id ? "✓" : s.id + 1}</span>
              <span className="wizard-step-label">{s.label}</span>
            </span>
          </Fragment>
        ))}
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <Field label="שם העסק">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: קפה הבוקר"
              autoFocus
            />
            <span className="mt-1.5 block text-[12px] text-text-3">השם יוצג למנהל העסק ולכל העובדים שלו</span>
          </Field>
          <Field label="הערה פנימית (אופציונלי)">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="לדוגמה: לקוח דרך המלצה, תקופת ניסיון חודשיים"
            />
            <span className="mt-1.5 block text-[12px] text-text-3">נראה רק לסופר אדמין — לא נחשף לעסק</span>
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="-mx-1">
          <ActiveModulesPanel
            enabledSet={enabledSet}
            onToggle={(key, enabled) => applyChanges([{ key, enabled }])}
            onBulkChange={applyChanges}
            headerSlot={<PlanPicker plan={plan} state={state} onPick={pickPlan} />}
          />
          <Field label="מגבלת משתמשים">
            <Input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              placeholder="השאירו ריק לללא הגבלה"
            />
            <span className="mt-1.5 block text-[12px] text-text-3">
              נאכף בשרת — לא יהיה אפשר ליצור משתמש נוסף מעבר למספר הזה. ריק = ללא הגבלה.
            </span>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[13px] border border-border bg-surface-2 p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-bold">
              <Icon name="summarize" size={18} className="text-text-3" />
              {name}
              <Badge tone="violet">{enabledModules.length} מודולים</Badge>
              <Badge tone="neutral">{seats.trim() ? `עד ${seats} משתמשים` : "ללא הגבלת משתמשים"}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {enabledModules.map((m) => (
                <span
                  key={m.key}
                  className="flex items-center gap-1 rounded-[7px] bg-surface px-2 py-1 text-[11.5px] font-semibold text-text-2"
                >
                  <Icon name={m.icon} size={14} />
                  {m.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-[11px] [background:var(--info-bg)] px-3 py-2.5 text-[12.5px] font-semibold text-text-2">
            <Icon name="info" size={18} />
            מנהל המערכת הוא המשתמש היחיד שתקימו כאן. הוא זה שיוסיף את שאר העובדים מתוך המערכת.
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="שם מלא">
              <Input value={mgrName} onChange={(e) => setMgrName(e.target.value)} placeholder="לדוגמה: דנה כהן" />
            </Field>
            <Field label="טלפון">
              <Input
                value={mgrPhone}
                onChange={(e) => setMgrPhone(e.target.value)}
                style={{ direction: "ltr", textAlign: "right" }}
                placeholder="050-0000000"
              />
            </Field>
          </div>
          <Field label="אימייל">
            <Input
              type="email"
              value={mgrEmail}
              onChange={(e) => setMgrEmail(e.target.value)}
              style={{ direction: "ltr", textAlign: "right" }}
              placeholder="manager@business.co.il"
            />
          </Field>
          <Field label="סיסמה ראשונית">
            <Input
              type="text"
              value={mgrPassword}
              onChange={(e) => setMgrPassword(e.target.value)}
              placeholder="לפחות 6 תווים"
            />
            <span className="mt-1.5 block text-[12px] text-text-3">מסרו אותה למנהל — הוא יוכל להחליף אותה בעצמו</span>
          </Field>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
          <Icon name="error" size={18} /> {error}
        </div>
      )}
    </Modal>
  );
}
