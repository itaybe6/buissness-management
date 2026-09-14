import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  PageHeader,
  PageLoader,
  ErrorState,
  Input,
  EmptyState,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useProfiles, useUpdateProfile, useDeleteUser } from "@/api/users";
import { useDepartments } from "@/api/departments";
import { useEmployeePositions, useReplaceEmployeePositions } from "@/api/employeePositions";
import { AddUserModal } from "@/components/AddUserModal";
import { PositionsEditor } from "@/components/users/PositionsEditor";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, USER_MANAGE_ROLES } from "@/lib/constants";
import {
  draftFromPosition,
  findDuplicatePositionDraft,
  positionLabel,
  positionWageSummary,
  positionsForEmployee,
  type PositionDraft,
} from "@/lib/employeePositions";
import type { EmployeePosition, Profile, UserRole } from "@/types/database";

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

export function Users() {
  const { profile: currentUser } = useAuth();
  const businessId = useBusinessId();
  const { data: users, isLoading, isError, refetch } = useProfiles(businessId);
  const { data: departments } = useDepartments(businessId);
  const { data: allPositions } = useEmployeePositions(businessId);
  const update = useUpdateProfile();
  const replacePositions = useReplaceEmployeePositions();
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
  const deptNameOrNull = useMemo(
    () => (id: string) => departments?.find((d) => d.id === id)?.name ?? null,
    [departments],
  );
  const positionsOf = (u: Profile): EmployeePosition[] => positionsForEmployee(u, allPositions);

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
      const positions = positionsForEmployee(u, allPositions)
        .map((p) => positionLabel(p, deptNameOrNull).toLowerCase())
        .join(" ");
      return name.includes(q) || email.includes(q) || phone.includes(q) || dept.includes(q) || positions.includes(q);
    });
  }, [users, search, roleFilter, deptName, deptNameOrNull, allPositions]);

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
                  const positions = positionsOf(u);
                  const multi = positions.length > 1;
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
                        <span className="user-cell-avatar">
                          <UserAvatar
                            userId={u.id}
                            name={u.full_name}
                            avatarUrl={u.avatar_url}
                            size={46}
                            rounded="square"
                          />
                          <span className="user-cell-dot" data-on={u.active} />
                        </span>
                        <span className="user-cell-info">
                          <span className="user-cell-name">{u.full_name}</span>
                          <span className="user-cell-sub">
                            {multi ? (
                              <span className="user-cell-role">
                                {positions.map((p) => positionLabel(p, deptNameOrNull)).join(" · ")}
                              </span>
                            ) : (
                              <>
                                <span className="user-cell-role">{ROLE_LABELS[u.role]}</span>
                                {dept !== "—" && <span className="user-cell-dept"> · {dept}</span>}
                              </>
                            )}
                            {!u.active && <span className="user-cell-off">מושבת</span>}
                          </span>
                        </span>
                        <Icon name="expand_more" size={20} className="user-cell-chevron" />
                      </button>
                      <div className="user-cell-details">
                        <div className="user-cell-details-clip">
                          <div className="user-cell-details-body">
                            <div className="user-cell-facts">
                              {positions.map((p) => (
                                <span key={p.id} className="user-fact">
                                  <Icon name={p.wage_type === "tips" ? "savings" : "payments"} size={17} />
                                  {multi && <b>{positionLabel(p, deptNameOrNull)} · </b>}
                                  {positionWageSummary(p, formatCurrency)}
                                </span>
                              ))}
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
              <div className={`min-w-[980px] grid ${USER_TABLE_COLS} gap-x-2`}>
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
                {filtered.map((u, i) => {
                  const positions = positionsOf(u);
                  const multi = positions.length > 1;
                  return (
                  <div
                    key={u.id}
                    className="data-row dash-rise col-span-8 grid grid-cols-subgrid items-start gap-x-2 border-b border-border-2 px-5 py-3 text-[13.5px]"
                    style={{ "--rise-delay": `${Math.min(i, 10) * 25}ms` } as React.CSSProperties}
                  >
                    <span className="flex min-w-0 items-center gap-3 self-center">
                      <UserAvatar
                        userId={u.id}
                        name={u.full_name}
                        avatarUrl={u.avatar_url}
                        size={36}
                        rounded="square"
                      />
                      <span className="truncate font-bold">{u.full_name}</span>
                    </span>
                    <span className="flex flex-wrap gap-1 self-center">
                      {multi ? (
                        positions.map((p) => (
                          <Badge key={p.id} tone={p.wage_type === "tips" ? "violet" : "neutral"}>
                            {positionLabel(p, deptNameOrNull)}
                          </Badge>
                        ))
                      ) : (
                        <Badge tone="neutral">{ROLE_LABELS[u.role]}</Badge>
                      )}
                    </span>
                    <span className="self-center text-text-2">{multi ? "—" : deptName(u.department_id)}</span>
                    <span className="flex flex-col gap-0.5 self-center text-[12.5px] text-text-2">
                      {positions.map((p) => (
                        <span key={p.id} className="whitespace-nowrap">
                          {multi && <span className="font-semibold text-text">{positionLabel(p, deptNameOrNull)}: </span>}
                          {positionWageSummary(p, formatCurrency)}
                        </span>
                      ))}
                    </span>
                    <span
                      className="min-w-0 self-center truncate text-[12.5px] text-text-2"
                      style={{ direction: "ltr", textAlign: "right" }}
                      title={u.email ?? undefined}
                    >
                      {u.email ?? "—"}
                    </span>
                    <span className="self-center whitespace-nowrap text-text-2" style={{ direction: "ltr", textAlign: "right" }}>{u.phone ?? "—"}</span>
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
                  );
                })}
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
          positions={positionsOf(edit)}
          departments={departments ?? []}
          onClose={() => setEdit(null)}
          onSave={async (patch, drafts) => {
            // Positions first: the DB trigger mirrors the primary one onto the
            // profile (role / department / wage), then the plain profile fields.
            await replacePositions.mutateAsync({
              business_id: businessId,
              employee_id: edit.id,
              positions: drafts,
            });
            await update.mutateAsync({ id: edit.id, ...patch });
            setEdit(null);
          }}
          saving={update.isPending || replacePositions.isPending}
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
  positions,
  departments,
  onClose,
  onSave,
  saving,
}: {
  user: Profile;
  positions: EmployeePosition[];
  departments: { id: string; name: string }[];
  onClose: () => void;
  onSave: (patch: Partial<Profile>, positions: PositionDraft[]) => Promise<void>;
  saving: boolean;
}) {
  const [drafts, setDrafts] = useState<PositionDraft[]>(() => positions.map(draftFromPosition));
  const [phone, setPhone] = useState(user.phone ?? "");
  const [birthDate, setBirthDate] = useState(user.birth_date ?? "");
  const [pensionActive, setPensionActive] = useState(user.pension_active ?? false);
  const [active, setActive] = useState(user.active);
  const [error, setError] = useState<string | null>(null);

  const editorRoles: UserRole[] = user.role === "manager" ? ["manager", ...ASSIGNABLE_ROLES] : ASSIGNABLE_ROLES;

  return (
    <Modal
      open
      onClose={onClose}
      title={user.full_name ?? "עריכת עובד"}
      subtitle="עדכון תפקידים, פרטי קשר ושכר"
      icon="manage_accounts"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button
            className="flex-1"
            loading={saving}
            onClick={async () => {
              setError(null);
              if (drafts.length === 0) return setError("יש להגדיר לפחות תפקיד אחד");
              const dup = findDuplicatePositionDraft(drafts);
              if (dup) return setError("יש שני תפקידים זהים (אותה הרשאה ומחלקה) — מחקו אחד מהם");
              try {
                await onSave(
                  {
                    phone: phone.trim() || null,
                    birth_date: birthDate || null,
                    pension_active: pensionActive,
                    active,
                  },
                  drafts,
                );
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
        <div>
          <span className="label-text">תפקידים והרשאות</span>
          <div className="mt-1.5">
            <PositionsEditor drafts={drafts} onChange={setDrafts} roles={editorRoles} departments={departments} />
          </div>
        </div>
        <label className="block"><span className="label-text">טלפון</span>
          <Input className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ direction: "ltr", textAlign: "right" }} placeholder="050-0000000" />
        </label>
        <label className="block"><span className="label-text">תאריך לידה</span>
          <Input className="mt-1.5" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </label>
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
