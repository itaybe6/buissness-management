import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { useProfiles } from "@/api/users";
import { useBusinesses, type BusinessWithStats } from "@/api/businesses";
import { AddUserModal } from "@/components/AddUserModal";
import { SeatMeter } from "@/components/superadmin/SeatMeter";
import { ROLE_LABELS } from "@/lib/constants";
import { PLAN_LABELS } from "@/lib/features";
import { colorFor, initialsOf } from "@/lib/db";
import type { UserRole } from "@/types/database";

/** Roles a super admin may create inside a business. */
const BUSINESS_ROLES: UserRole[] = [
  "manager",
  "shift_manager",
  "office_manager",
  "event_manager",
  "employee",
  "maintenance",
];

/** Pseudo-scope for super admins, who belong to no business. */
const PLATFORM_SCOPE = "__platform__";

export function PlatformUsers() {
  const { data: users, isLoading, isError, refetch } = useProfiles();
  const { data: businesses, isLoading: bizLoading } = useBusinesses();
  const [scope, setScope] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const reduce = useReducedMotion();

  const platformUsers = useMemo(() => (users ?? []).filter((u) => !u.business_id), [users]);

  const selected: BusinessWithStats | null = useMemo(
    () => (scope && scope !== PLATFORM_SCOPE ? (businesses ?? []).find((b) => b.id === scope) ?? null : null),
    [scope, businesses],
  );

  const scopedUsers = useMemo(() => {
    if (!scope) return [];
    const base = scope === PLATFORM_SCOPE ? platformUsers : (users ?? []).filter((u) => u.business_id === scope);
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (u) => (u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q),
    );
  }, [scope, users, platformUsers, search]);

  if (isLoading || bizLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  // ---------------------------------------------------------------- picker
  if (!scope) {
    return (
      <div className="w-full animate-fadeUp">
        <PageHeader
          title="משתמשים"
          subtitle="בחרו עסק כדי לנהל את המשתמשים שלו"
        />

        {(businesses ?? []).length === 0 ? (
          <EmptyState
            icon="store"
            title="אין עדיין עסקים"
            description="כדי לנהל משתמשים צריך קודם להקים עסק בעמוד העסקים."
          />
        ) : (
          <div className="biz-rail">
            {(businesses ?? []).map((b, i) => (
              <motion.button
                key={b.id}
                type="button"
                onClick={() => setScope(b.id)}
                className="biz-tile"
                data-inactive={!b.active}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.05, ease: [0.32, 0.72, 0, 1] }}
              >
                <span className="biz-tile-sheen" aria-hidden />
                <span className="biz-tile-head">
                  <span className="biz-tile-mark" style={{ background: colorFor(b.id) }}>
                    {initialsOf(b.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="biz-tile-name block">{b.name}</span>
                    <span className="biz-tile-sub">
                      {PLAN_LABELS[b.plan]} · {b.feature_count} מודולים
                    </span>
                  </span>
                  {!b.active && <Badge tone="danger">מושהה</Badge>}
                  <Icon name="chevron_left" size={20} className="flex-none text-text-3" />
                </span>

                <span className="biz-tile-stats">
                  <span className="biz-tile-stat">
                    <span className="biz-tile-stat-value block">{b.employee_count}</span>
                    <span className="biz-tile-stat-label block">משתמשים</span>
                  </span>
                  <span className="biz-tile-stat">
                    <span className="biz-tile-stat-value block">{b.manager_count}</span>
                    <span className="biz-tile-stat-label block">מנהלי מערכת</span>
                  </span>
                  <span className="biz-tile-stat">
                    <span className="biz-tile-stat-value block">
                      {b.max_users == null ? "∞" : b.seats_left}
                    </span>
                    <span className="biz-tile-stat-label block">מקומות פנויים</span>
                  </span>
                </span>

                <SeatMeter used={b.employee_count} cap={b.max_users} />
              </motion.button>
            ))}

            {platformUsers.length > 0 && (
              <motion.button
                type="button"
                onClick={() => setScope(PLATFORM_SCOPE)}
                className="biz-tile"
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: reduce ? 0 : (businesses ?? []).length * 0.05 }}
              >
                <span className="biz-tile-sheen" aria-hidden />
                <span className="biz-tile-head">
                  <span className="biz-tile-mark [background:var(--ink)]">
                    <Icon name="shield_person" size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="biz-tile-name block">צוות הפלטפורמה</span>
                    <span className="biz-tile-sub">סופר אדמינים ללא שיוך לעסק</span>
                  </span>
                  <Icon name="chevron_left" size={20} className="flex-none text-text-3" />
                </span>
                <span className="biz-tile-stats">
                  <span className="biz-tile-stat">
                    <span className="biz-tile-stat-value block">{platformUsers.length}</span>
                    <span className="biz-tile-stat-label block">משתמשים</span>
                  </span>
                </span>
              </motion.button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------------- scoped list
  const isPlatform = scope === PLATFORM_SCOPE;
  const title = isPlatform ? "צוות הפלטפורמה" : selected?.name ?? "עסק";
  const seatsFull = !!selected && selected.max_users != null && selected.employee_count >= selected.max_users;

  return (
    <div className="w-full animate-fadeUp">
      <button
        onClick={() => {
          setScope(null);
          setSearch("");
        }}
        className="mb-3.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-text-2 hover:text-text"
      >
        <Icon name="arrow_forward" size={19} /> חזרה לבחירת עסק
      </button>

      <PageHeader
        title={title}
        subtitle={
          isPlatform
            ? `${scopedUsers.length} משתמשי פלטפורמה`
            : `${selected?.employee_count ?? 0} משתמשים · חבילת ${PLAN_LABELS[selected?.plan ?? "custom"]}`
        }
        actions={
          !isPlatform && (
            <Button icon="person_add" disabled={seatsFull} onClick={() => setAddOpen(true)}>
              הוספת משתמש
            </Button>
          )
        }
      />

      {seatsFull && (
        <div className="mb-4 flex items-center gap-2 rounded-[11px] [background:var(--warning-bg)] px-3.5 py-3 text-[13px] font-semibold text-text-2">
          <Icon name="group_off" size={19} />
          העסק הגיע למגבלת {selected?.max_users} משתמשים. הגדילו את המגבלה בעמוד העסק כדי להוסיף עוד.
        </div>
      )}

      <div className="mb-4 max-w-[360px]">
        <div className="relative">
          <Icon name="search" size={19} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input
            className="pr-10"
            placeholder="חיפוש משתמש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-auto">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[2fr_1.3fr_1.8fr_1.2fr] gap-2 border-b border-border bg-surface-2 px-5 py-3 text-[12px] font-bold text-text-3">
              <span>משתמש</span>
              <span>תפקיד</span>
              <span>אימייל</span>
              <span>טלפון</span>
            </div>
            {scopedUsers.map((u) => (
              <div
                key={u.id}
                className="grid grid-cols-[2fr_1.3fr_1.8fr_1.2fr] items-center gap-2 border-b border-border-2 px-5 py-3 text-[13.5px] last:border-0 hover:bg-surface-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-[13px] font-bold text-white"
                    style={{ background: colorFor(u.id) }}
                  >
                    {initialsOf(u.full_name)}
                  </span>
                  <span className="truncate font-bold">{u.full_name}</span>
                </span>
                <span>
                  <Badge tone={u.role === "manager" ? "violet" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
                </span>
                <span className="truncate text-text-2" style={{ direction: "ltr", textAlign: "right" }}>
                  {u.email}
                </span>
                <span className="truncate text-text-2" style={{ direction: "ltr", textAlign: "right" }}>
                  {u.phone || "—"}
                </span>
              </div>
            ))}
            {scopedUsers.length === 0 && (
              <div className="px-5 py-10 text-center text-text-2">
                {search ? "לא נמצאו משתמשים בחיפוש הזה." : "אין עדיין משתמשים בעסק הזה."}
              </div>
            )}
          </div>
        </div>
      </Card>

      {!isPlatform && selected && (
        <AddUserModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          businessId={selected.id}
          roles={BUSINESS_ROLES}
        />
      )}
    </div>
  );
}
