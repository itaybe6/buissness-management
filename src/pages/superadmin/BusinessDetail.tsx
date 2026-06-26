import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Icon,
  Input,
  PageLoader,
  ErrorState,
  Switch,
} from "@/components/ui";
import { useBusiness, useBusinessFeatures, useSetFeature, useUpdateBusiness } from "@/api/businesses";
import { useProfiles } from "@/api/users";
import { AddUserModal } from "@/components/AddUserModal";
import { ALL_FEATURES, ROLE_LABELS } from "@/lib/constants";
import { colorFor, initialsOf } from "@/lib/db";
import type { FeatureKey, UserRole } from "@/types/database";

const ASSIGNABLE_ROLES: UserRole[] = [
  "manager",
  "department_manager",
  "shift_manager",
  "office_manager",
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
  const updateBiz = useUpdateBusiness();
  const [name, setName] = useState<string | null>(null);
  const [addUser, setAddUser] = useState(false);

  if (isLoading) return <PageLoader />;
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  const enabledSet = new Set((features ?? []).filter((f) => f.enabled).map((f) => f.feature_key));
  const nameValue = name ?? biz.name;

  return (
    <div className="mx-auto max-w-[1060px] animate-fadeUp">
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
            <div className="mt-0.5">{biz.active ? <Badge tone="success">פעיל</Badge> : <Badge tone="danger">מושהה</Badge>}</div>
          </div>
        </div>
        <Button
          variant={biz.active ? "secondary" : "primary"}
          icon={biz.active ? "pause" : "play_arrow"}
          onClick={() => updateBiz.mutate({ id: biz.id, active: !biz.active })}
        >
          {biz.active ? "השהיית עסק" : "הפעלת עסק"}
        </Button>
      </div>

      <Card className="mb-5 p-5">
        <div className="mb-4 text-[13px] font-bold uppercase tracking-wide text-text-3">פרטי העסק</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1">
            <span className="label-text">שם העסק</span>
            <Input className="mt-1.5" value={nameValue} onChange={(e) => setName(e.target.value)} />
          </label>
          <Button
            variant="secondary"
            icon="save"
            disabled={nameValue === biz.name}
            loading={updateBiz.isPending}
            onClick={() => updateBiz.mutate({ id: biz.id, name: nameValue })}
          >
            שמירה
          </Button>
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <div className="text-[18px] font-extrabold">מודולים פעילים</div>
        <Badge tone="violet">{enabledSet.size} מתוך {ALL_FEATURES.length}</Badge>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_FEATURES.map((f) => {
          const on = enabledSet.has(f.key as FeatureKey);
          return (
            <Card
              key={f.key}
              className="cursor-pointer p-4 transition"
              style={{ borderColor: on ? "var(--accent)" : undefined, background: on ? "var(--accent-tint)" : undefined }}
              onClick={() => setFeature.mutate({ businessId: biz.id, feature: f.key, enabled: !on })}
            >
              <div className="mb-3 flex items-start justify-between gap-2.5">
                <span className="grid h-11 w-11 place-items-center rounded-[12px]" style={{ background: on ? "var(--accent)" : "var(--surface-2)" }}>
                  <Icon name={f.icon} size={24} className={on ? "text-white" : "text-text-3"} />
                </span>
                <Switch checked={on} />
              </div>
              <div className="text-[15px] font-bold">{f.label}</div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-text-2">{f.desc}</div>
            </Card>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="text-[18px] font-extrabold">משתמשים ({users?.length ?? 0})</div>
        <Button icon="person_add" onClick={() => setAddUser(true)}>הוספת משתמש</Button>
      </div>
      <Card className="overflow-hidden">
        {users && users.length === 0 ? (
          <div className="px-5 py-10 text-center text-text-2">אין עדיין משתמשים בעסק זה.</div>
        ) : (
          (users ?? []).map((u) => (
            <div key={u.id} className="flex items-center gap-3 border-b border-border-2 px-5 py-3 text-[13.5px] last:border-0">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[13px] font-bold text-white" style={{ background: colorFor(u.id) }}>
                {initialsOf(u.full_name)}
              </span>
              <span className="flex-1 font-bold">{u.full_name}</span>
              <Badge tone="neutral">{ROLE_LABELS[u.role]}</Badge>
              <span className="hidden text-text-3 sm:block" style={{ direction: "ltr" }}>{u.email}</span>
            </div>
          ))
        )}
      </Card>

      <AddUserModal open={addUser} onClose={() => setAddUser(false)} businessId={biz.id} roles={ASSIGNABLE_ROLES} />
    </div>
  );
}
