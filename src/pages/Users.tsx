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
import { useProfiles, useUpdateProfile, useDeleteUser } from "@/api/users";
import { useDepartments } from "@/api/departments";
import { AddUserModal } from "@/components/AddUserModal";
import { useBusinessId, colorFor, initialsOf, formatCurrency } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, WAGE_TYPE_LABELS, BONUS_ELIGIBLE_ROLES, USER_MANAGE_ROLES } from "@/lib/constants";
import type { Profile, UserRole, WageType } from "@/types/database";

const ASSIGNABLE_ROLES: UserRole[] = [
  "shift_manager",
  "office_manager",
  "event_manager",
  "employee",
  "maintenance",
];

const FILTER_ROLES: (UserRole | "all")[] = ["all", "manager", ...ASSIGNABLE_ROLES];

const USER_TABLE_COLS =
  "grid-cols-[2fr_1.1fr_1fr_1.3fr_minmax(200px,2.4fr)_1fr_0.9fr_0.7fr]";

function wageSummary(u: Profile): string {
  const type = WAGE_TYPE_LABELS[u.wage_type ?? "hourly"];
  const rate = u.hourly_rate ?? 0;
  const bonus = Number(u.bonus_pct) > 0 ? ` · ${u.bonus_pct}% קופה` : "";
  if (u.wage_type === "tips") return `${type} · מינ׳ ${formatCurrency(rate)}${bonus}`;
  return `${type} · ${formatCurrency(rate)}/שע׳${bonus}`;
}

export function Users() {
  const { profile: currentUser } = useAuth();
  const businessId = useBusinessId();
  const { data: users, isLoading, isError, refetch } = useProfiles(businessId);
  const { data: departments } = useDepartments(businessId);
  const update = useUpdateProfile();
  const del = useDeleteUser();
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<Profile | null>(null);
  const [toDelete, setToDelete] = useState<Profile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const canManageUsers = !!(currentUser && USER_MANAGE_ROLES.includes(currentUser.role));

  const deptName = useMemo(
    () => (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—",
    [departments],
  );

  const roleCounts = useMemo(() => {
    const counts = new Map<UserRole | "all", number>();
    for (const u of users ?? []) counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    counts.set("all", (users ?? []).length);
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      const name = (u.full_name ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      const phone = (u.phone ?? "").toLowerCase();
      const dept = deptName(u.department_id).toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || dept.includes(q);
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
    <div className="w-full animate-fadeUp">
      <PageHeader
        title="משתמשים וצוות"
        subtitle="ניהול עובדי העסק והרשאות גישה"
        actions={
          canManageUsers ? (
            <Button icon="person_add" onClick={() => setAdd(true)} className="hidden md:inline-flex">
              הוספת משתמש
            </Button>
          ) : undefined
        }
      />

      {users && users.length === 0 ? (
        <EmptyState icon="group" title="אין עדיין עובדים" description="הוסיפו את חברי הצוות של העסק." action={canManageUsers ? <Button icon="person_add" onClick={() => setAdd(true)}>הוספת משתמש</Button> : undefined} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1 md:max-w-[360px]">
                <Icon name="search" size={19} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
                <Input
                  className="pr-10"
                  placeholder="חיפוש משתמש..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRoleFilterOpen(true)}
                  aria-label="סינון לפי תפקיד"
                  className="users-filter-btn btn-press"
                  data-active={roleFilter !== "all"}
                >
                  <Icon name="filter_list" size={21} />
                </button>
                {canManageUsers && (
                  <button
                    type="button"
                    onClick={() => setAdd(true)}
                    aria-label="הוספת משתמש"
                    className="users-add-btn btn-press md:hidden"
                  >
                    <Icon name="person_add" size={21} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Mobile — app-style roster ── */}
          <div className="users-mobile md:hidden">
            {filtered.length === 0 ? (
              <div className="users-roster-empty">
                <Icon name="search_off" size={30} />
                <span>לא נמצאו משתמשים</span>
              </div>
            ) : (
              <div className="users-roster">
                {filtered.map((u, i) => {
                  const open = expanded === u.id;
                  const dept = deptName(u.department_id);
                  return (
                    <div
                      key={u.id}
                      className="user-cell"
                      data-open={open}
                      style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                    >
                      <button
                        type="button"
                        className="user-cell-row"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : u.id)}
                      >
                        <span className="user-cell-avatar person-chip" style={{ background: colorFor(u.id) }}>
                          {initialsOf(u.full_name)}
                          <span className="user-cell-dot" data-on={u.active} />
                        </span>
                        <span className="user-cell-info">
                          <span className="user-cell-name">{u.full_name}</span>
                          <span className="user-cell-sub">
                            <span className="user-cell-role">{ROLE_LABELS[u.role]}</span>
                            {dept !== "—" && <span className="user-cell-dept"> · {dept}</span>}
                            {!u.active && <span className="user-cell-off">מושבת</span>}
                          </span>
                        </span>
                        <Icon name="expand_more" size={20} className="user-cell-chevron" />
                      </button>
                      <div className="user-cell-details">
                        <div className="user-cell-details-clip">
                          <div className="user-cell-details-body">
                            <div className="user-cell-facts">
                              <span className="user-fact">
                                <Icon name="payments" size={17} />
                                {wageSummary(u)}
                              </span>
                              {u.phone && (
                                <a href={`tel:${u.phone}`} className="user-fact user-fact--link">
                                  <Icon name="call" size={17} />
                                  <bdi dir="ltr">{u.phone}</bdi>
                                </a>
                              )}
                              {u.email && (
                                <a href={`mailto:${u.email}`} className="user-fact user-fact--link">
                                  <Icon name="mail" size={17} />
                                  <bdi dir="ltr">{u.email}</bdi>
                                </a>
                              )}
                            </div>
                            <div className="user-cell-actions">
                              <button type="button" className="user-cell-btn user-cell-btn--edit" onClick={() => setEdit(u)}>
                                <Icon name="edit" size={17} /> עריכה
                              </button>
                              {u.id !== currentUser?.id && (
                                <button
                                  type="button"
                                  className="user-cell-btn user-cell-btn--danger"
                                  onClick={() => { setDeleteError(null); setToDelete(u); }}
                                >
                                  <Icon name="delete" size={17} /> מחיקה
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Desktop — full table ── */}
          <Card className="hidden overflow-hidden !p-0 shadow-card md:block">
            <div className="overflow-auto">
              <div className={`min-w-[1040px] grid ${USER_TABLE_COLS} gap-x-2`}>
                <div className={`col-span-8 grid grid-cols-subgrid gap-x-2 border-b border-border bg-surface-2 px-5 py-3 text-[11.5px] font-bold uppercase tracking-wide text-text-3`}>
                  <span>עובד</span>
                  <span>תפקיד</span>
                  <span>מחלקה</span>
                  <span>שכר</span>
                  <span>אימייל</span>
                  <span>טלפון</span>
                  <span>סטטוס</span>
                  <span aria-hidden="true" />
                </div>
                {filtered.map((u, i) => (
                  <div
                    key={u.id}
                    className="data-row dash-rise col-span-8 grid grid-cols-subgrid items-start gap-x-2 border-b border-border-2 px-5 py-3 text-[13.5px]"
                    style={{ "--rise-delay": `${Math.min(i, 10) * 25}ms` } as React.CSSProperties}
                  >
                    <span className="flex min-w-0 items-center gap-3 self-center">
                      <span className="person-chip h-9 w-9 rounded-[10px] text-[13px]" style={{ background: colorFor(u.id) }}>
                        {initialsOf(u.full_name)}
                      </span>
                      <span className="truncate font-bold">{u.full_name}</span>
                    </span>
                    <span className="self-center"><Badge tone="neutral">{ROLE_LABELS[u.role]}</Badge></span>
                    <span className="self-center text-text-2">{deptName(u.department_id)}</span>
                    <span className="self-center text-text-2">{wageSummary(u)}</span>
                    <span
                      className="break-all text-[12.5px] leading-snug text-text-2"
                      style={{ direction: "ltr", textAlign: "left", unicodeBidi: "plaintext" }}
                    >
                      {u.email ?? "—"}
                    </span>
                    <span className="self-center whitespace-nowrap text-text-2" style={{ direction: "ltr", textAlign: "left" }}>{u.phone ?? "—"}</span>
                    <span className="self-center">{u.active ? <Badge tone="success">פעיל</Badge> : <Badge tone="neutral">מושבת</Badge>}</span>
                    <span className="flex items-center justify-end gap-0.5 self-center">
                      <button
                        type="button"
                        onClick={() => setEdit(u)}
                        className="data-row-action"
                        aria-label="עריכה"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => { setDeleteError(null); setToDelete(u); }}
                          className="grid h-8 w-8 place-items-center rounded-lg text-text-3 transition hover:[background:var(--danger-bg)] hover:text-danger"
                          aria-label="מחיקה"
                        >
                          <Icon name="delete" size={19} />
                        </button>
                      )}
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

      <Modal
        open={roleFilterOpen}
        onClose={() => setRoleFilterOpen(false)}
        title="סינון לפי תפקיד"
        icon="filter_list"
      >
        <div className="flex flex-col gap-1">
          {FILTER_ROLES.map((r) => {
            const active = roleFilter === r;
            const count = roleCounts.get(r) ?? 0;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRoleFilter(r);
                  setRoleFilterOpen(false);
                }}
                data-active={active}
                className="users-role-filter-option"
              >
                <span>{r === "all" ? "הכל" : ROLE_LABELS[r]}</span>
                {count > 0 && <span className="users-role-filter-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </Modal>

      {canManageUsers && (
        <AddUserModal open={add} onClose={() => setAdd(false)} businessId={businessId} roles={ASSIGNABLE_ROLES} />
      )}

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

      {toDelete && (
        <Modal
          open
          onClose={() => !del.isPending && setToDelete(null)}
          title="מחיקת עובד"
          subtitle={toDelete.full_name ?? ""}
          icon="person_remove"
          footer={
            <>
              <Button variant="secondary" onClick={() => setToDelete(null)} disabled={del.isPending}>ביטול</Button>
              <Button
                className="flex-1 !bg-danger"
                loading={del.isPending}
                onClick={async () => {
                  setDeleteError(null);
                  try {
                    await del.mutateAsync(toDelete.id);
                    setToDelete(null);
                  } catch (e) {
                    setDeleteError(e instanceof Error ? e.message : "שגיאה במחיקה");
                  }
                }}
              >
                מחק לצמיתות
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-[14px] leading-relaxed text-text-2">
              פעולה זו תמחק את <span className="font-bold text-text">{toDelete.full_name}</span> ואת כל הנתונים הקשורים אליו:
              נוכחות, משמרות, טיפים, שכר, הסכמים, טפסים, משימות ועוד. לא ניתן לשחזר.
            </p>
            {deleteError && (
              <div className="flex items-start gap-2 rounded-[11px] [background:var(--danger-bg)] px-3 py-2.5 text-[13px] font-semibold text-danger">
                <Icon name="error" size={18} /> {deleteError}
              </div>
            )}
          </div>
        </Modal>
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
  const [phone, setPhone] = useState(user.phone ?? "");
  const [wageType, setWageType] = useState<WageType>(user.wage_type ?? "hourly");
  const [hourly, setHourly] = useState(String(user.hourly_rate ?? 0));
  const [bonusPct, setBonusPct] = useState(String(user.bonus_pct ?? 0));
  const [pensionActive, setPensionActive] = useState(user.pension_active ?? false);
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={user.full_name ?? "עריכת עובד"}
      subtitle="עדכון תפקיד, מחלקה, פרטי קשר ושכר"
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
                await onSave({
                  role,
                  department_id: role === "employee" ? departmentId || null : null,
                  phone: phone.trim() || null,
                  hourly_rate: Number(hourly) || 0,
                  wage_type: wageType,
                  bonus_pct: BONUS_ELIGIBLE_ROLES.includes(role) ? Number(bonusPct) || 0 : 0,
                  pension_active: pensionActive,
                  active,
                });
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
        <label className="block"><span className="label-text">טלפון</span>
          <Input className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ direction: "ltr", textAlign: "right" }} placeholder="050-0000000" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="label-text">סוג שכר</span>
            <Select className="mt-1.5" value={wageType} onChange={(e) => setWageType(e.target.value as WageType)}>
              {(Object.keys(WAGE_TYPE_LABELS) as WageType[]).map((w) => (
                <option key={w} value={w}>{WAGE_TYPE_LABELS[w]}</option>
              ))}
            </Select>
          </label>
          <label className="block"><span className="label-text">{wageType === "tips" ? "מינימום לשעה (₪)" : "שכר שעתי (₪)"}</span>
            <Input className="mt-1.5" type="number" value={hourly} onChange={(e) => setHourly(e.target.value)} />
          </label>
        </div>
        {BONUS_ELIGIBLE_ROLES.includes(role) && (
          <label className="block">
            <span className="label-text">אחוז מהקופה (%)</span>
            <Input
              className="mt-1.5"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={bonusPct}
              onChange={(e) => setBonusPct(e.target.value)}
              placeholder="0"
            />
            <span className="mt-1 block text-[12px] leading-relaxed text-text-2">
              תוספת שכר אוטומטית במשמרות שעבד בהן — לפי אחוז מסכום המכירות בדוח.
            </span>
          </label>
        )}
        <label className="flex cursor-pointer items-center gap-2.5 rounded-[11px] border border-border px-3.5 py-3">
          <input
            type="checkbox"
            checked={pensionActive}
            onChange={(e) => setPensionActive(e.target.checked)}
            className="h-[17px] w-[17px]"
            style={{ accentColor: "var(--accent-2)" }}
          />
          <span className="text-[14px] font-semibold">פנסיה פעילה</span>
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
