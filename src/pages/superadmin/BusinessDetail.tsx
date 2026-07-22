import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, ErrorState, Field, Icon, Input, PageLoader } from "@/components/ui";
import {
  useApplyFeatureState,
  useBusiness,
  useBusinessFeatures,
  useSetFeature,
  useUpdateBusiness,
} from "@/api/businesses";
import { useProfiles } from "@/api/users";
import { AddUserModal } from "@/components/AddUserModal";
import { ActiveModulesPanel } from "@/components/superadmin/ActiveModulesPanel";
import { PlanPicker } from "@/components/superadmin/PlanPicker";
import { SeatMeter } from "@/components/superadmin/SeatMeter";
import { ROLE_LABELS } from "@/lib/constants";
import {
  PLAN_LABELS,
  detectPlan,
  featureStateForPlan,
  featureStateFromKeys,
} from "@/lib/features";
import { colorFor, initialsOf } from "@/lib/db";
import type { BusinessPlan, FeatureKey, UserRole } from "@/types/database";

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
  const setFeature = useSetFeature();
  const applyState = useApplyFeatureState();
  const updateBiz = useUpdateBusiness();

  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [seats, setSeats] = useState<string | null>(null);
  const [addUser, setAddUser] = useState(false);

  const enabledSet = useMemo(
    () => new Set((features ?? []).filter((f) => f.enabled).map((f) => f.feature_key)),
    [features],
  );
  const state = useMemo(() => featureStateFromKeys(enabledSet), [enabledSet]);
  const livePlan = useMemo(() => detectPlan(state), [state]);

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  const nameValue = name ?? biz.name;
  const notesValue = notes ?? biz.admin_notes ?? "";
  const seatsValue = seats ?? (biz.max_users == null ? "" : String(biz.max_users));
  const memberCount = users?.length ?? 0;
  const managers = (users ?? []).filter((u) => u.role === "manager");

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

  function applyPlan(plan: Exclude<BusinessPlan, "custom">) {
    applyState.mutate({ businessId: biz!.id, state: featureStateForPlan(plan), plan });
  }

  function toggleModules(changes: { key: FeatureKey; enabled: boolean }[]) {
    const nextState = { ...state };
    for (const c of changes) nextState[c.key] = c.enabled;
    applyState.mutate({ businessId: biz!.id, state: nextState, plan: detectPlan(nextState) });
  }

  return (
    <div className="w-full animate-fadeUp">
      <button
        onClick={() => navigate("/businesses")}
        className="mb-3.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-text-2 hover:text-text"
      >
        <Icon name="arrow_forward" size={19} /> חזרה לרשימת העסקים
      </button>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex items-center gap-3">
          <span
            className="grid h-12 w-12 flex-none place-items-center rounded-[13px] text-[16px] font-bold text-white"
            style={{ background: colorFor(biz.id) }}
          >
            {initialsOf(biz.name)}
          </span>
          <div>
            <div className="text-[24px] font-extrabold tracking-tight">{biz.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {biz.active ? <Badge tone="success">פעיל</Badge> : <Badge tone="danger">מושהה</Badge>}
              <Badge tone={livePlan === "custom" ? "neutral" : "violet"}>חבילת {PLAN_LABELS[livePlan]}</Badge>
              <Badge tone="neutral">{enabledSet.size} מודולים</Badge>
            </div>
          </div>
        </div>
        <Button
          variant={biz.active ? "secondary" : "primary"}
          icon={biz.active ? "pause" : "play_arrow"}
          loading={updateBiz.isPending}
          onClick={() => updateBiz.mutate({ id: biz.id, active: !biz.active })}
        >
          {biz.active ? "השהיית עסק" : "הפעלת עסק"}
        </Button>
      </div>

      {!biz.active && (
        <div className="mb-5 flex items-center gap-2 rounded-[12px] [background:var(--danger-bg)] px-3.5 py-3 text-[13px] font-semibold text-danger">
          <Icon name="pause_circle" size={19} />
          העסק מושהה. המשתמשים שלו עדיין יכולים להתחבר — ההשהיה היא סימון ניהולי בלבד.
        </div>
      )}

      <Card className="mb-5 p-5">
        <div className="mb-4 text-[13px] font-bold uppercase tracking-wide text-text-3">פרטי העסק</div>
        <div className="grid gap-3.5 md:grid-cols-2">
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
            <span className="mt-1.5 block text-[12px] text-text-3">
              נאכף בשרת. כרגע רשומים {memberCount} משתמשים.
            </span>
          </Field>
        </div>
        <Field label="הערה פנימית" className="mt-3.5">
          <Input
            value={notesValue}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="נראה רק לסופר אדמין"
          />
        </Field>
        <div className="mt-4 flex justify-start">
          <Button
            variant="secondary"
            icon="save"
            disabled={!detailsDirty}
            loading={updateBiz.isPending}
            onClick={saveDetails}
          >
            שמירת שינויים
          </Button>
        </div>
      </Card>

      <ActiveModulesPanel
        enabledSet={enabledSet}
        onToggle={(feature, enabled) => setFeature.mutate({ businessId: biz.id, feature, enabled })}
        onBulkChange={toggleModules}
        headerSlot={<PlanPicker plan={livePlan} state={state} onPick={applyPlan} />}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[18px] font-extrabold">משתמשים ({memberCount})</div>
          <div className="mt-0.5 text-[12.5px] text-text-3">
            {managers.length > 0
              ? `${managers.length} מנהלי מערכת · הם מוסיפים את שאר הצוות`
              : "אין עדיין מנהל מערכת — הוסיפו אחד כדי שהעסק יוכל להתחיל לעבוד"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden w-[150px] sm:block">
            <SeatMeter used={memberCount} cap={biz.max_users} />
          </div>
          <Button
            icon="person_add"
            disabled={biz.max_users != null && memberCount >= biz.max_users}
            onClick={() => setAddUser(true)}
          >
            הוספת משתמש
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {memberCount === 0 ? (
          <div className="px-5 py-10 text-center text-text-2">אין עדיין משתמשים בעסק זה.</div>
        ) : (
          (users ?? []).map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 border-b border-border-2 px-5 py-3 text-[13.5px] last:border-0"
            >
              <span
                className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[13px] font-bold text-white"
                style={{ background: colorFor(u.id) }}
              >
                {initialsOf(u.full_name)}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold">{u.full_name}</span>
              <Badge tone={u.role === "manager" ? "violet" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
              <span className="hidden truncate text-text-3 sm:block" style={{ direction: "ltr" }}>
                {u.email}
              </span>
            </div>
          ))
        )}
      </Card>

      <AddUserModal
        open={addUser}
        onClose={() => setAddUser(false)}
        businessId={biz.id}
        roles={ASSIGNABLE_ROLES}
      />
    </div>
  );
}
