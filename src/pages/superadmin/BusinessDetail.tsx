import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, ErrorState, Field, Icon, Input, PageLoader } from "@/components/ui";
import {
  useApplyFeatureState,
  useBusiness,
  useBusinessFeatures,
  useFeatureDataReport,
  useUpdateBusiness,
  type ApplyFeaturesResult,
} from "@/api/businesses";
import { useProfiles } from "@/api/users";
import { AddUserModal } from "@/components/AddUserModal";
import { FeaturePicker } from "@/components/superadmin/FeaturePicker";
import { FeaturePurgeDialog } from "@/components/superadmin/FeaturePurgeDialog";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ROLE_LABELS } from "@/lib/constants";
import {
  ALL_FEATURE_KEYS,
  MODULE_BY_KEY,
  detectPlan,
  enabledKeysOf,
  featureStateFromKeys,
  type FeatureState,
} from "@/lib/features";
import { colorFor, initialsOf } from "@/lib/db";
import type { BusinessPlan, FeatureKey, UserRole } from "@/types/database";

/**
 * A feature switch-off waiting for confirmation. The next state lives here and
 * nothing is written until the dialog is confirmed — so cancelling really is a
 * no-op, and the card stays lit in the meantime.
 */
interface PendingPurge {
  state: FeatureState;
  plan: BusinessPlan;
  /** Features going off, lead first. */
  off: FeatureKey[];
  lead: FeatureKey;
}

const ASSIGNABLE_ROLES: UserRole[] = [
  "manager",
  "shift_manager",
  "office_manager",
  "event_manager",
  "employee",
  "maintenance",
];

export function BusinessDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const businessId = id ?? null;
  const { data: biz, isLoading, isError, refetch } = useBusiness(businessId);
  const { data: features } = useBusinessFeatures(businessId);
  const { data: users } = useProfiles(businessId);
  const applyState = useApplyFeatureState();
  const updateBiz = useUpdateBusiness();

  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [seats, setSeats] = useState<string | null>(null);
  const [addUser, setAddUser] = useState(false);
  const [pending, setPending] = useState<PendingPurge | null>(null);
  const [purgeResult, setPurgeResult] = useState<ApplyFeaturesResult | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const enabledSet = useMemo(
    () => new Set((features ?? []).filter((f) => f.enabled).map((f) => f.feature_key)),
    [features],
  );
  const state = useMemo(() => featureStateFromKeys(enabledSet), [enabledSet]);
  const pendingOff = useMemo(() => new Set(pending?.off ?? []), [pending]);
  const enabledFeatures = useMemo(() => enabledKeysOf(state).map((k) => MODULE_BY_KEY.get(k)!), [state]);

  // Counted fresh every time the dialog opens — a stale number on a delete
  // confirmation is worse than no number.
  const dataReport = useFeatureDataReport(businessId, pending?.off ?? [], !!pending);

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  const nameValue = name ?? biz.name;
  const notesValue = notes ?? biz.admin_notes ?? "";
  const seatsValue = seats ?? (biz.max_users == null ? "" : String(biz.max_users));
  const memberCount = users?.length ?? 0;
  const managers = (users ?? []).filter((u) => u.role === "manager");
  const seatsFull = biz.max_users != null && memberCount >= biz.max_users;
  const seatPct = biz.max_users ? Math.min(100, Math.round((memberCount / biz.max_users) * 100)) : 0;
  const brandColor = colorFor(biz.id);

  const detailsDirty =
    nameValue !== biz.name ||
    notesValue !== (biz.admin_notes ?? "") ||
    seatsValue !== (biz.max_users == null ? "" : String(biz.max_users));

  function saveDetails() {
    const cap = seatsValue.trim() ? Number(seatsValue) : null;
    if (cap != null && (!Number.isFinite(cap) || cap < 1)) return;
    updateBiz.mutate(
      { id: biz!.id, name: nameValue.trim(), admin_notes: notesValue.trim() || null, max_users: cap },
      {
        onSuccess: () => {
          setName(null);
          setNotes(null);
          setSeats(null);
        },
      },
    );
  }

  /** Features that are on today and would be off in `next` — i.e. lose their data. */
  function featuresLosingData(next: FeatureState): FeatureKey[] {
    return ALL_FEATURE_KEYS.filter((k) => state[k] && !next[k]);
  }

  function toggleFeatures(changes: { key: FeatureKey; enabled: boolean }[]) {
    const next = { ...state };
    for (const c of changes) next[c.key] = c.enabled;
    // Only switch-ons reach here; the picker routes switch-offs to requestDisable.
    applyState.mutate({ businessId: biz!.id, state: next, plan: detectPlan(next) });
  }

  /**
   * The one door every switch-off goes through: it deletes that feature's data,
   * so it stops here and waits for the dialog.
   */
  function requestDisable(key: FeatureKey, cascade: FeatureKey[]) {
    const next = { ...state };
    for (const k of cascade) next[k] = false;

    const off = featuresLosingData(next);
    if (off.length === 0) {
      applyState.mutate({ businessId: biz!.id, state: next, plan: detectPlan(next) });
      return;
    }

    setPurgeResult(null);
    setPurgeError(null);
    setPending({
      state: next,
      plan: detectPlan(next),
      lead: key,
      // Lead first so the dialog can separate "what you clicked" from the cascade.
      off: [key, ...off.filter((k) => k !== key)].filter((k) => off.includes(k)),
    });
  }

  function confirmPurge() {
    if (!pending) return;
    setPurgeError(null);
    applyState.mutate(
      { businessId: biz!.id, state: pending.state, plan: pending.plan, purge: pending.off },
      {
        onSuccess: (res) => setPurgeResult(res),
        onError: (e) => setPurgeError(e instanceof Error ? e.message : "המחיקה נכשלה"),
      },
    );
  }

  function closePurge() {
    setPending(null);
    setPurgeResult(null);
    setPurgeError(null);
  }

  return (
    <div className="cbp-page bzd-page">
      <header className="cbp-hero">
        <span className="cbp-glow cbp-glow--1" aria-hidden />
        <span className="cbp-glow cbp-glow--2" aria-hidden />
        <span className="cbp-grid-lines" aria-hidden />

        <div className="cbp-hero-inner">
          <div className="cbp-hero-bar">
            <button type="button" className="cbp-back" onClick={() => navigate("/businesses")}>
              <Icon name="arrow_forward" size={18} />
              רשימת העסקים
            </button>
            <span className="bzd-state" data-active={biz.active}>
              <span className="bzd-state-dot" aria-hidden />
              {biz.active ? "פעיל" : "מושהה"}
            </span>
          </div>

          <div className="cbp-hero-id">
            <span className="cbp-mono" style={{ background: brandColor }}>
              {initialsOf(biz.name)}
            </span>
            <div className="cbp-hero-copy">
              <h1 className="cbp-hero-title">עסק בפלטפורמה</h1>
              <p className="cbp-hero-name">{biz.name}</p>
            </div>
            <div className="cbp-hero-stats">
              <span className="cbp-stat">
                <span className="cbp-stat-value">{enabledSet.size}</span>
                <span className="cbp-stat-label">פיצ'רים</span>
              </span>
              <span className="cbp-stat-sep" aria-hidden />
              <span className="cbp-stat">
                <span className="cbp-stat-value">{memberCount}</span>
                <span className="cbp-stat-label">משתמשים</span>
              </span>
            </div>
          </div>

          <div className="bzd-hero-acts">
            <button
              type="button"
              className="bzd-act"
              data-busy={updateBiz.isPending}
              onClick={() => updateBiz.mutate({ id: biz.id, active: !biz.active })}
            >
              <Icon name={biz.active ? "pause" : "play_arrow"} size={17} />
              {biz.active ? "השהיית עסק" : "הפעלת עסק"}
            </button>
            <span className="bzd-hero-note">
              <Icon name="apps" size={15} />
              {enabledSet.size} מתוך {ALL_FEATURE_KEYS.length} פיצ'רים דלוקים
            </span>
          </div>
        </div>
      </header>

      <div className="cbp-body">
        <main className="cbp-stage">
          {!biz.active && (
            <div className="bzd-suspended">
              <Icon name="pause_circle" size={19} />
              העסק מושהה. המשתמשים שלו עדיין יכולים להתחבר — ההשהיה היא סימון ניהולי בלבד.
            </div>
          )}

          <FeaturePicker
            enabledSet={enabledSet}
            onChange={toggleFeatures}
            onRequestDisable={requestDisable}
            pendingOff={pendingOff}
            title="פיצ'רים"
            lede="לחיצה מדליקה פיצ'ר מיד. כיבוי מוחק את הנתונים שלו לצמיתות — ולכן עובר דרך אישור."
          />

          <section className="bzd-users">
            <header className="bzd-users-head">
              <span className="cbp-section-icon">
                <Icon name="group" size={22} />
              </span>
              <div className="bzd-users-copy">
                <h2 className="cbp-section-title">משתמשים ({memberCount})</h2>
                <p className="cbp-section-lede">
                  {managers.length > 0
                    ? `${managers.length} מנהלי מערכת · הם מוסיפים את שאר הצוות`
                    : "אין עדיין מנהל מערכת — הוסיפו אחד כדי שהעסק יוכל להתחיל לעבוד"}
                </p>
              </div>
              <Button
                icon="person_add"
                disabled={seatsFull}
                title={seatsFull ? "העסק הגיע למגבלת המשתמשים" : undefined}
                onClick={() => setAddUser(true)}
              >
                הוספת משתמש
              </Button>
            </header>

            {memberCount === 0 ? (
              <p className="bzd-users-empty">
                <Icon name="person_off" size={22} />
                אין עדיין משתמשים בעסק זה.
              </p>
            ) : (
              <ul className="bzd-roster">
                {(users ?? []).map((u) => (
                  <li key={u.id} className="bzd-person">
                    <UserAvatar
                      userId={u.id}
                      name={u.full_name}
                      avatarUrl={u.avatar_url}
                      size={38}
                      rounded="square"
                    />
                    <span className="bzd-person-copy">
                      <span className="bzd-person-name">{u.full_name}</span>
                      <span className="bzd-person-mail" style={{ direction: "ltr" }}>
                        {u.email}
                      </span>
                    </span>
                    <span className="bzd-person-role" data-lead={u.role === "manager"}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside className="cbp-rail">
          <div className="cbp-rail-card">
            <h2 className="cbp-rail-title">פרטי העסק</h2>
            <div className="bzd-form">
              <Field label="שם העסק">
                <Input value={nameValue} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="מגבלת משתמשים">
                <Input
                  type="number"
                  min={1}
                  value={seatsValue}
                  onChange={(e) => setSeats(e.target.value)}
                  placeholder="ריק = ללא הגבלה"
                />
              </Field>
              <Field label="הערה פנימית">
                <Input
                  value={notesValue}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="נראה רק לסופר אדמין"
                />
              </Field>
            </div>
            <Button
              className="bzd-save"
              variant="secondary"
              icon="save"
              disabled={!detailsDirty}
              loading={updateBiz.isPending}
              onClick={saveDetails}
            >
              {detailsDirty ? "שמירת שינויים" : "אין שינויים"}
            </Button>
          </div>

          <div className="cbp-rail-card">
            <h2 className="cbp-rail-title">
              תפוסת משתמשים
              <span className="cbp-rail-count">
                {memberCount}
                {biz.max_users != null && `/${biz.max_users}`}
              </span>
            </h2>
            {biz.max_users == null ? (
              <p className="cbp-rail-empty">ללא הגבלה — אפשר להוסיף כמה שצריך</p>
            ) : (
              <>
                <div className="cbp-rail-track" aria-hidden>
                  <span
                    className="cbp-rail-fill"
                    data-tone={seatsFull ? "full" : seatPct >= 80 ? "warn" : "ok"}
                    style={{ width: `${seatPct}%` }}
                  />
                </div>
                <p className="cbp-rail-empty">
                  {seatsFull ? "המגבלה מלאה — הוסיפו מושבים כדי לצרף עוד" : `נותרו ${biz.max_users - memberCount} מקומות`}
                </p>
              </>
            )}
          </div>

          {enabledFeatures.length > 0 && (
            <div className="cbp-rail-card">
              <h2 className="cbp-rail-title">
                פיצ'רים פעילים
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
              <div className="cbp-chip-grid">
                {enabledFeatures.map((m) => (
                  <span key={m.key} className="cbp-chip">
                    <Icon name={m.icon} size={14} />
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <AddUserModal
        open={addUser}
        onClose={() => setAddUser(false)}
        businessId={biz.id}
        roles={ASSIGNABLE_ROLES}
      />

      {pending && (
        <FeaturePurgeDialog
          open
          businessName={biz.name}
          keys={pending.off}
          leadKey={pending.lead}
          report={dataReport.data}
          reportLoading={dataReport.isLoading}
          reportError={dataReport.isError}
          working={applyState.isPending}
          result={purgeResult}
          error={purgeError}
          onCancel={closePurge}
          onConfirm={confirmPurge}
        />
      )}
    </div>
  );
}
