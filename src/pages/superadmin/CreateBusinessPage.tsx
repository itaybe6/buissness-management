import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button, Field, Icon, Input } from "@/components/ui";
import { FeaturePicker } from "@/components/superadmin/FeaturePicker";
import { useCreateBusiness } from "@/api/businesses";
import { ALL_FEATURE_KEYS, MODULE_BY_KEY, emptyFeatureState, enabledKeysOf, type FeatureState } from "@/lib/features";
import {
  parseSeatCap,
  validateDetailsStep,
  validateManagerStep,
  validateModuleStep,
} from "@/lib/businessSetup";
import { colorFor, initialsOf } from "@/lib/db";
import type { FeatureKey } from "@/types/database";

const STEPS = [
  { id: 0, label: "פרטי העסק", short: "פרטים", icon: "storefront", hint: "שם והערות פנימיות" },
  { id: 1, label: "בחירת פיצ'רים", short: "פיצ'רים", icon: "apps", hint: "מה העסק מקבל" },
  { id: 2, label: "מנהל המערכת", short: "מנהל", icon: "shield_person", hint: "משתמש ראשון" },
] as const;

const NEXT_UP = [
  { icon: "apps", title: "בחירת פיצ'רים", desc: "מסמנים בדיוק מה העסק מקבל — כל השאר לא קיים אצלו" },
  { icon: "shield_person", title: "מנהל המערכת", desc: "המשתמש הראשון שנכנס למערכת ומקים את הצוות" },
  { icon: "rocket_launch", title: "והעסק באוויר", desc: "המנהל מוסיף עובדים ומתחיל לעבוד באותו רגע" },
] as const;

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function CreateBusinessPage() {
  const navigate = useNavigate();
  const create = useCreateBusiness();
  const reduce = useReducedMotion();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<FeatureState>(() => emptyFeatureState());
  const [seats, setSeats] = useState("");
  const [mgrName, setMgrName] = useState("");
  const [mgrEmail, setMgrEmail] = useState("");
  const [mgrPhone, setMgrPhone] = useState("");
  const [mgrPassword, setMgrPassword] = useState("");

  const enabledSet = useMemo(() => new Set(enabledKeysOf(state)), [state]);
  const enabledFeatures = useMemo(() => enabledKeysOf(state).map((k) => MODULE_BY_KEY.get(k)!), [state]);
  const progress = ((step + 1) / STEPS.length) * 100;
  const displayName = name.trim() || "עסק חדש";
  const monogram = name.trim() ? initialsOf(name.trim()) : "+";
  const brandColor = colorFor(name.trim() || "new-business");
  const seatsLabel = seats.trim() ? `עד ${seats} משתמשים` : "ללא הגבלת משתמשים";

  function applyChanges(changes: { key: FeatureKey; enabled: boolean }[]) {
    setState((prev) => {
      const next = { ...prev };
      for (const c of changes) next[c.key] = c.enabled;
      return next;
    });
  }

  function goBack() {
    setError(null);
    if (step === 0) navigate("/businesses");
    else setStep(step - 1);
  }

  function next() {
    setError(null);
    if (step === 0) {
      const err = validateDetailsStep({ name, notes });
      return err ? setError(err) : setStep(1);
    }
    if (step === 1) {
      const err = validateModuleStep({ state, seats });
      return err ? setError(err) : setStep(2);
    }
  }

  async function submit(withManager: boolean) {
    setError(null);
    if (withManager) {
      const err = validateManagerStep({
        full_name: mgrName,
        email: mgrEmail,
        password: mgrPassword,
        phone: mgrPhone,
      });
      if (err) return setError(err);
    }

    const { cap, error: seatError } = parseSeatCap(seats);
    if (seatError) return setError(seatError);

    try {
      const biz = await create.mutateAsync({
        name: name.trim(),
        features: state,
        plan: "custom",
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
      navigate(`/businesses/${biz.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה ביצירת העסק");
    }
  }

  return (
    <div className="cbp-page">
      <header className="cbp-hero">
        <span className="cbp-glow cbp-glow--1" aria-hidden />
        <span className="cbp-glow cbp-glow--2" aria-hidden />
        <span className="cbp-grid-lines" aria-hidden />

        <div className="cbp-hero-inner">
          <div className="cbp-hero-bar">
            <button type="button" className="cbp-back" onClick={goBack}>
              <Icon name="arrow_forward" size={18} />
              {step === 0 ? "ביטול" : "חזרה"}
            </button>
            <span className="cbp-hero-tag">
              <Icon name="tune" size={15} />
              מותאם אישית
            </span>
          </div>

          <div className="cbp-hero-id">
            <span
              className="cbp-mono"
              data-empty={!name.trim()}
              style={{ background: name.trim() ? brandColor : undefined }}
            >
              {monogram}
            </span>
            <div className="cbp-hero-copy">
              <h1 className="cbp-hero-title">הקמת עסק חדש</h1>
              <p className="cbp-hero-name">{displayName}</p>
            </div>
            <div className="cbp-hero-stats">
              <span className="cbp-stat">
                <span className="cbp-stat-value">{enabledSet.size}</span>
                <span className="cbp-stat-label">פיצ'רים</span>
              </span>
              <span className="cbp-stat-sep" aria-hidden />
              <span className="cbp-stat">
                <span className="cbp-stat-value">{ALL_FEATURE_KEYS.length}</span>
                <span className="cbp-stat-label">בקטלוג</span>
              </span>
            </div>
          </div>

          <nav className="cbp-steps" aria-label="שלבי הקמת עסק">
            {STEPS.map((s) => {
              const done = step > s.id;
              const active = step === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="cbp-step"
                  data-state={active ? "active" : done ? "done" : "todo"}
                  onClick={() => {
                    if (s.id < step) {
                      setError(null);
                      setStep(s.id);
                    }
                  }}
                  disabled={s.id > step}
                  aria-current={active ? "step" : undefined}
                >
                  <span className="cbp-step-icon">
                    {done ? <Icon name="check" size={16} /> : <Icon name={s.icon} size={16} />}
                  </span>
                  <span className="cbp-step-copy">
                    <span className="cbp-step-label">{s.label}</span>
                    <span className="cbp-step-hint">{s.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="cbp-progress" aria-hidden>
            <span className="cbp-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <div className="cbp-body" data-step={step}>
        <main className="cbp-stage">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              className="cbp-panel"
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.34, ease: EASE }}
            >
              {step === 0 && (
                <section className="cbp-form-section">
                  <div className="cbp-card">
                    <header className="cbp-section-head">
                      <span className="cbp-section-icon">
                        <Icon name="storefront" size={22} />
                      </span>
                      <div>
                        <h2 className="cbp-section-title">פרטי העסק</h2>
                        <p className="cbp-section-lede">
                          השם יוצג למנהל העסק ולכל העובדים שלו. ההערה נשארת פנימית.
                        </p>
                      </div>
                    </header>

                    <div className="cbp-fields">
                      <Field label="שם העסק">
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="לדוגמה: קפה הבוקר"
                          autoFocus
                          className="cbp-input-lg"
                        />
                      </Field>
                      <Field label="הערה פנימית (אופציונלי)">
                        <Input
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="לדוגמה: לקוח דרך המלצה, תקופת ניסיון חודשיים"
                        />
                        <span className="cbp-field-hint">נראה רק לסופר אדמין — לא נחשף לעסק</span>
                      </Field>
                    </div>
                  </div>

                  <div className="cbp-card cbp-card--quiet">
                    <h3 className="cbp-mini-title">מה עוד מחכה</h3>
                    <ol className="cbp-next-list">
                      {NEXT_UP.map((item, i) => (
                        <li key={item.title} className="cbp-next-item">
                          <span className="cbp-next-index">{i + 1}</span>
                          <span className="cbp-next-icon">
                            <Icon name={item.icon} size={18} />
                          </span>
                          <span className="cbp-next-copy">
                            <span className="cbp-next-title">{item.title}</span>
                            <span className="cbp-next-desc">{item.desc}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </section>
              )}

              {step === 1 && (
                <section className="cbp-features-section">
                  <FeaturePicker enabledSet={enabledSet} onChange={applyChanges} />

                  <div className="cbp-seats-card">
                    <span className="cbp-seats-icon">
                      <Icon name="group" size={20} />
                    </span>
                    <div className="cbp-seats-copy">
                      <h3 className="cbp-seats-title">מגבלת משתמשים</h3>
                      <p className="cbp-seats-lede">נאכף בשרת — השאירו ריק לללא הגבלה</p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={seats}
                      onChange={(e) => setSeats(e.target.value)}
                      placeholder="ללא הגבלה"
                      className="cbp-seats-input"
                    />
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="cbp-form-section">
                  <div className="cbp-summary-card">
                    <div className="cbp-summary-head">
                      <span className="cbp-summary-mono" style={{ background: brandColor }}>
                        {monogram}
                      </span>
                      <div className="cbp-summary-copy">
                        <p className="cbp-summary-name">{displayName}</p>
                        <p className="cbp-summary-meta">
                          {enabledFeatures.length} פיצ'רים · {seatsLabel}
                        </p>
                      </div>
                      <button type="button" className="cbp-summary-edit" onClick={() => setStep(1)}>
                        <Icon name="tune" size={16} />
                        עריכה
                      </button>
                    </div>
                    <div className="cbp-chip-grid">
                      {enabledFeatures.map((m) => (
                        <span key={m.key} className="cbp-chip">
                          <Icon name={m.icon} size={14} />
                          {m.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="cbp-card">
                    <header className="cbp-section-head">
                      <span className="cbp-section-icon">
                        <Icon name="shield_person" size={22} />
                      </span>
                      <div>
                        <h2 className="cbp-section-title">מנהל המערכת</h2>
                        <p className="cbp-section-lede">
                          המשתמש היחיד שתקימו כאן. הוא יוסיף את שאר העובדים מתוך המערכת.
                        </p>
                      </div>
                    </header>

                    <div className="cbp-fields cbp-fields--grid">
                      <Field label="שם מלא">
                        <Input
                          value={mgrName}
                          onChange={(e) => setMgrName(e.target.value)}
                          placeholder="לדוגמה: דנה כהן"
                        />
                      </Field>
                      <Field label="טלפון">
                        <Input
                          value={mgrPhone}
                          onChange={(e) => setMgrPhone(e.target.value)}
                          style={{ direction: "ltr", textAlign: "right" }}
                          placeholder="050-0000000"
                        />
                      </Field>
                      <Field label="אימייל" className="cbp-field-span">
                        <Input
                          type="email"
                          value={mgrEmail}
                          onChange={(e) => setMgrEmail(e.target.value)}
                          style={{ direction: "ltr", textAlign: "right" }}
                          placeholder="manager@business.co.il"
                        />
                      </Field>
                      <Field label="סיסמה ראשונית" className="cbp-field-span">
                        <Input
                          type="text"
                          value={mgrPassword}
                          onChange={(e) => setMgrPassword(e.target.value)}
                          placeholder="לפחות 6 תווים"
                        />
                        <span className="cbp-field-hint">מסרו אותה למנהל — הוא יוכל להחליף אותה בעצמו</span>
                      </Field>
                    </div>
                  </div>

                  <div className="cbp-info-banner">
                    <Icon name="info" size={18} />
                    <span>אפשר גם ליצור את העסק עכשיו ולהוסיף את המנהל מאוחר יותר מעמוד העסק.</span>
                    <button
                      type="button"
                      className="cbp-banner-action"
                      disabled={create.isPending}
                      onClick={() => submit(false)}
                    >
                      יצירה ללא מנהל
                    </button>
                  </div>
                </section>
              )}
            </motion.div>
          </AnimatePresence>

          {error && (
            <div className="cbp-error" role="alert">
              <Icon name="error" size={18} />
              {error}
            </div>
          )}
        </main>

        <aside className="cbp-rail">
          <div className="cbp-rail-card">
            <h2 className="cbp-rail-title">תמונת מצב</h2>
            <div className="cbp-rail-id">
              <span
                className="cbp-rail-mono"
                data-empty={!name.trim()}
                style={{ background: name.trim() ? brandColor : undefined }}
              >
                {monogram}
              </span>
              <span className="cbp-rail-name">{displayName}</span>
            </div>
            <div className="cbp-rail-row">
              <Icon name="apps" size={18} />
              <span>{enabledSet.size} פיצ'רים פעילים</span>
            </div>
            <div className="cbp-rail-row">
              <Icon name="group" size={18} />
              <span>{seatsLabel}</span>
            </div>
            {notes.trim() && (
              <p className="cbp-rail-note">
                <Icon name="sticky_note_2" size={16} />
                {notes.trim()}
              </p>
            )}
          </div>

          {step >= 1 && (
            <div className="cbp-rail-card">
              <h2 className="cbp-rail-title">
                פיצ'רים שנבחרו
                <span className="cbp-rail-count">
                  {enabledSet.size}/{ALL_FEATURE_KEYS.length}
                </span>
              </h2>
              <div className="cbp-rail-track" aria-hidden>
                <span
                  className="cbp-rail-fill"
                  style={{ width: `${(enabledSet.size / ALL_FEATURE_KEYS.length) * 100}%` }}
                />
              </div>
              {enabledFeatures.length > 0 ? (
                <div className="cbp-chip-grid">
                  {enabledFeatures.map((m) => (
                    <span key={m.key} className="cbp-chip">
                      <Icon name={m.icon} size={14} />
                      {m.label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="cbp-rail-empty">עדיין לא נבחר אף פיצ'ר</p>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="cbp-footer">
        <div className="cbp-footer-inner">
          <span className="cbp-footer-step">
            שלב {step + 1} מתוך {STEPS.length} · {STEPS[step].short}
          </span>
          <Button variant="secondary" icon="arrow_forward" onClick={goBack}>
            {step === 0 ? "ביטול" : "חזרה"}
          </Button>
          {step < 2 ? (
            <Button className="cbp-footer-primary" icon="arrow_back" onClick={next}>
              המשך ל{STEPS[step + 1].label}
            </Button>
          ) : (
            <Button
              className="cbp-footer-primary"
              icon="check"
              loading={create.isPending}
              onClick={() => submit(true)}
            >
              יצירת העסק והמנהל
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
