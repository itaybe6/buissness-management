import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  PageHeader,
  PageLoader,
  ErrorState,
  Select,
  Input,
  EmptyState,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useProfiles, useUpdateProfile } from "@/api/users";
import { useDepartments } from "@/api/departments";
import { AddUserModal } from "@/components/AddUserModal";
import { useBusinessId } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/constants";
import { colorFor, initialsOf } from "@/lib/db";
import type { Profile, UserRole } from "@/types/database";

const ASSIGNABLE_ROLES: UserRole[] = [
  "department_manager",
  "shift_manager",
  "office_manager",
  "employee",
  "maintenance",
];

const FILTER_ROLES: (UserRole | "all")[] = ["all", "manager", ...ASSIGNABLE_ROLES];

export function Users() {
  const businessId = useBusinessId();
  const { data: users, isLoading, isError, refetch } = useProfiles(businessId);
  const { data: departments } = useDepartments(businessId);
  const update = useUpdateProfile();
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");

  const deptName = useMemo(
    () => (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—",
    [departments],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      const name = (u.full_name ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      const dept = deptName(u.department_id).toLowerCase();
      return name.includes(q) || email.includes(q) || dept.includes(q);
    });
  }, [users, search, roleFilter, deptName]);

  if (!businessId) {
    return (
      <EmptyState
        icon="store"
        title="לא משויך לעסק"
        description="המשתמש שלך עדיין לא משויך לעסק. פנו לסופר אדמין כדי לשייך אתכם לעסק."
      />
    );
  }

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-[1100px] animate-fadeUp">
      <PageHeader
        title="משתמשים וצוות"
        subtitle="ניהול עובדי העסק והרשאות גישה"
        actions={<Button icon="person_add" onClick={() => setAdd(true)}>הוספת משתמש</Button>}
      />

      {users && users.length === 0 ? (
        <EmptyState icon="group" title="אין עדיין עובדים" description="הוסיפו את חברי הצוות של העסק." action={<Button icon="person_add" onClick={() => setAdd(true)}>הוספת משתמש</Button>} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <div className="relative max-w-[360px]">
              <Icon name="search" size={19} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
              <Input
                className="pr-10"
                placeholder="חיפוש משתמש..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-[12px] border border-border bg-surface-2 p-1">
              {FILTER_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`shrink-0 rounded-[10px] px-3.5 py-2 text-[13px] font-bold transition ${roleFilter === r ? "text-white [background:var(--ink)]" : "text-text-2 hover:text-text"}`}
                >
                  {r === "all" ? "הכל" : ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[2fr_1.3fr_1.2fr_1.6fr_1fr_0.5fr] gap-2 border-b border-border bg-surface-2 px-5 py-3 text-[12px] font-bold text-text-3">
                  <span>עובד</span><span>תפקיד</span><span>מחלקה</span><span>אימייל</span><span>סטטוס</span><span></span>
                </div>
                {filtered.map((u) => (
                  <div key={u.id} className="grid grid-cols-[2fr_1.3fr_1.2fr_1.6fr_1fr_0.5fr] items-center gap-2 border-b border-border-2 px-5 py-3 text-[13.5px] hover:bg-surface-2">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[13px] font-bold text-white" style={{ background: colorFor(u.id) }}>
                        {initialsOf(u.full_name)}
                      </span>
                      <span className="truncate font-bold">{u.full_name}</span>
                    </span>
                    <span><Badge tone="neutral">{ROLE_LABELS[u.role]}</Badge></span>
                    <span className="text-text-2">{deptName(u.department_id)}</span>
                    <span className="truncate text-text-2" style={{ direction: "ltr", textAlign: "right" }}>{u.email}</span>
                    <span>{u.active ? <Badge tone="success">פעיל</Badge> : <Badge tone="neutral">מושבת</Badge>}</span>
                    <span className="text-left">
                      <button onClick={() => setEdit(u)} className="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface-2 hover:text-text">
                        <Icon name="edit" size={19} />
                      </button>
                    </span>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="px-5 py-10 text-center text-text-2">לא נמצאו משתמשים.</div>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      <AddUserModal open={add} onClose={() => setAdd(false)} businessId={businessId} roles={ASSIGNABLE_ROLES} />

      {edit && (
        <EditUserModal
          user={edit}
          departments={departments ?? []}
          onClose={() => setEdit(null)}
          onSave={async (patch) => {
            await update.mutateAsync({ id: edit.id, ...patch });
            setEdit(null);
          }}
          saving={update.isPending}
        />
      )}
    </div>
  );
}

function EditUserModal({
  user,
  departments,
  onClose,
  onSave,
  saving,
}: {
  user: Profile;
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSave: (patch: Partial<Profile>) => Promise<void>;
  saving: boolean;
}) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [departmentId, setDepartmentId] = useState(user.department_id ?? "");
  const [hourly, setHourly] = useState(String(user.hourly_rate ?? 0));
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={user.full_name ?? "עריכת עובד"}
      subtitle="עדכון תפקיד, מחלקה ושכר"
      icon="manage_accounts"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button
            className="flex-1"
            loading={saving}
            onClick={async () => {
              setError(null);
              try {
                await onSave({ role, department_id: role === "employee" ? departmentId || null : null, hourly_rate: Number(hourly) || 0, active });
              } catch (e) {
                setError(e instanceof Error ? e.message : "שגיאה בשמירה");
              }
            }}
          >
            שמירה
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <label className="block"><span className="label-text">הרשאה</span>
          <Select
            className="mt-1.5"
            value={role}
            onChange={(e) => {
              const next = e.target.value as UserRole;
              setRole(next);
              if (next !== "employee") setDepartmentId("");
            }}
          >
            {ASSIGNABLE_ROLES.concat(role === "manager" ? ["manager"] : []).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
        </label>
        {role === "employee" && (
          <label className="block"><span className="label-text">מחלקה</span>
            <Select className="mt-1.5" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— ללא —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </label>
        )}
        <label className="block"><span className="label-text">שכר שעתי (₪)</span>
          <Input className="mt-1.5" type="number" value={hourly} onChange={(e) => setHourly(e.target.value)} />
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-[11px] border border-border px-3.5 py-3">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-[17px] w-[17px]" style={{ accentColor: "var(--accent-2)" }} />
          <span className="text-[14px] font-semibold">משתמש פעיל</span>
        </label>
        {error && (
          <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Icon name="error" size={18} /> {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
