import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  PageLoader,
  ErrorState,
  Input,
  EmptyState,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { motion } from "motion/react";
import { InkStage, RollingNumber } from "@/components/bits";
import { useProfiles, useUpdateProfile, useDeleteUser } from "@/api/users";
import { useDepartments } from "@/api/departments";
import { useEmployeePositions, useReplaceEmployeePositions } from "@/api/employeePositions";
import { AddUserModal } from "@/components/AddUserModal";
import { PositionsEditor } from "@/components/users/PositionsEditor";
import { useBusinessId, formatCurrency } from "@/lib/db";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth";
import { canAccessPayroll, ROLE_LABELS, USER_MANAGE_ROLES } from "@/lib/constants";
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
  "department_manager",
  "shift_manager",
  "office_manager",
  "event_manager",
  "employee",
  "maintenance",
];

const FILTER_ROLES: (UserRole | "all")[] = ["all", "manager", ...ASSIGNABLE_ROLES];

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
  const [expanded, setExpanded] = useState<string | null>(null);

  const canManageUsers = !!(currentUser && USER_MANAGE_ROLES.includes(currentUser.role));
  const showPay = canAccessPayroll(currentUser?.role);
  const tableTracks = [
    "2fr",
    "1.1fr",
    "1fr",
    ...(showPay ? ["1.3fr"] : []),
    "minmax(200px,2.4fr)",
    "1fr",
    "0.9fr",
    ...(canManageUsers ? ["0.7fr"] : []),
  ];

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

  const activeCount = (users ?? []).filter((u) => u.active).length;
  const roleChips = FILTER_ROLES.filter((r) => r === "all" || (roleCounts.get(r) ?? 0) > 0);
  const faces = (users ?? []).filter((u) => u.active).slice(0, 4);

  return (
    <div className="pyx-page">
      <InkStage className="usx-hero">
        <div className="srx-bar">
          <h1 className="srx-page-title">צוות</h1>
          {canManageUsers && (
            <button type="button" className="srx-cta" data-spark onClick={() => setAdd(true)}>
              <Icon name="person_add" size={19} />
              <span>עובד חדש</span>
            </button>
          )}
        </div>

        <div className="usx-head">
          <div className="srx-head-copy">
            <div className="srx-total-label">אנשים בעסק</div>
            <div className="srx-total">
              <RollingNumber value={(users ?? []).length} />
            </div>
            <div className="usx-active">
              <span className="usx-active-dot" />
              {activeCount} פעילים
            </div>
          </div>
          {faces.length > 0 && (
            <div className="usx-faces" aria-hidden>
              {faces.map((u, i) => (
                <span key={u.id} className="usx-face" style={{ "--i": i } as React.CSSProperties}>
                  <UserAvatar userId={u.id} name={u.full_name} avatarUrl={u.avatar_url} size={44} rounded="circle" />
                </span>
              ))}
              {(users ?? []).length > faces.length && (
                <span className="usx-face usx-face--more" style={{ "--i": faces.length } as React.CSSProperties}>
                  +{(users ?? []).length - faces.length}
                </span>
              )}
            </div>
          )}
        </div>

        {roleChips.length > 2 && (
          <div className="usx-roles" role="group" aria-label="סינון לפי תפקיד">
            {roleChips.map((r) => {
              const active = roleFilter === r;
              return (
                <button
                  key={r}
                  type="button"
                  className="usx-role"
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => setRoleFilter(r)}
                >
                  {active && (
                    <motion.span
                      layoutId="usx-role-pill"
                      className="usx-role-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span>{r === "all" ? "כולם" : ROLE_LABELS[r]}</span>
                  <b>{roleCounts.get(r) ?? 0}</b>
                </button>
              );
            })}
          </div>
        )}
      </InkStage>

      <div className="srx-body">
      {users && users.length === 0 ? (
        <EmptyState icon="group" title="אין עדיין עובדים" action={canManageUsers ? <Button icon="person_add" onClick={() => setAdd(true)}>הוספת משתמש</Button> : undefined} />
      ) : (
        <>
          <div className="srx-toolbar">
            <div className="srx-toolbar-title">{filtered.length} אנשים</div>
            <div className="pyx-search">
              <Icon name="search" size={19} className="pyx-search-icon" />
              <Input
                className="pr-10"
                placeholder="חיפוש לפי שם, טלפון או מחלקה"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="חיפוש משתמש"
              />
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
                              {showPay && positions.map((p) => (
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
                            {canManageUsers && (
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
                            )}
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
          <Card className="pyx-table hidden overflow-hidden !p-0 shadow-card md:block">
            <div className="overflow-auto">
              <div className="min-w-[980px] grid gap-x-2" style={{ gridTemplateColumns: tableTracks.join(" ") }}>
                <div className="grid grid-cols-subgrid gap-x-2 border-b border-border bg-surface-2 px-5 py-3 text-[12.5px] font-bold text-text-3" style={{ gridColumn: "1 / -1" }}>
                  <span>עובד</span>
                  <span>תפקיד</span>
                  <span>מחלקה</span>
                  {showPay && <span>שכר</span>}
                  <span>אימייל</span>
                  <span>טלפון</span>
                  <span>סטטוס</span>
                  {canManageUsers && <span aria-hidden="true" />}
                </div>
                {filtered.map((u, i) => {
                  const positions = positionsOf(u);
                  const multi = positions.length > 1;
                  return (
                  <div
                    key={u.id}
                    className="data-row dash-rise grid grid-cols-subgrid items-start gap-x-2 border-b border-border-2 px-5 py-3 text-[13.5px]"
                    style={{ "--rise-delay": `${Math.min(i, 10) * 25}ms`, gridColumn: "1 / -1" } as React.CSSProperties}
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
                          <Badge key={p.id} tone="neutral">
                            {positionLabel(p, deptNameOrNull)}
                          </Badge>
                        ))
                      ) : (
                        <Badge tone="neutral">{ROLE_LABELS[u.role]}</Badge>
                      )}
                    </span>
                    <span className="self-center text-text-2">{multi ? "—" : deptName(u.department_id)}</span>
                    {showPay && (
                    <span className="flex flex-col gap-0.5 self-center text-[12.5px] text-text-2">
                      {positions.map((p) => (
                        <span key={p.id} className="whitespace-nowrap">
                          {multi && <span className="font-semibold text-text">{positionLabel(p, deptNameOrNull)}: </span>}
                          {positionWageSummary(p, formatCurrency)}
                        </span>
                      ))}
                    </span>
                    )}
                    <span
                      className="min-w-0 self-center truncate text-[12.5px] text-text-2"
                      style={{ direction: "ltr", textAlign: "right" }}
                      title={u.email ?? undefined}
                    >
                      {u.email ?? "—"}
                    </span>
                    <span className="self-center whitespace-nowrap text-text-2" style={{ direction: "ltr", textAlign: "right" }}>{u.phone ?? "—"}</span>
                    <span className="usx-status self-center" data-on={u.active || undefined}>{u.active ? "פעיל" : "מושבת"}</span>
                    {canManageUsers && (
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
                    )}
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
      </div>

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
