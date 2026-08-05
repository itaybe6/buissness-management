import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { Badge, Button, EmptyState, Icon, Input, PageLoader, ErrorState, Switch } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useBusiness, useUpdateBusiness } from "@/api/businesses";
import {
  ATTENDANCE_GEOFENCE_EXEMPT_ROLE_OPTIONS,
  ATTENDANCE_RADIUS_DEFAULT_M,
  ATTENDANCE_RADIUS_MAX_M,
  ATTENDANCE_RADIUS_MIN_M,
  ATTENDANCE_RADIUS_OPTIONS_M,
  ATTENDANCE_RADIUS_TIGHT_M,
  clampAttendanceRadius,
  DEFAULT_WAREHOUSE_NAME,
  ROLE_LABELS,
} from "@/lib/constants";
import {
  accuracySlackMeters,
  distanceMeters,
  formatDistance,
  isUnreliableAccuracy,
} from "@/lib/attendanceGeofence";
import { geolocationFailureMessage, getBestPosition } from "@/lib/geolocation";
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from "@/api/departments";
import {
  useInventoryCategories,
  useCreateInventoryCategory,
  useUpdateInventoryCategory,
  useDeleteInventoryCategory,
  nextInventoryCategoryColor,
} from "@/api/inventoryCategories";
import {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useDeleteWarehouse,
} from "@/api/warehouses";
import {
  useShiftTemplates,
  useCreateShiftTemplate,
  useUpdateShiftTemplate,
  useDeleteShiftTemplate,
} from "@/api/shifts";
import { useBusinessId, HE_DAYS } from "@/lib/db";
import { HE_DAYS_SHORT } from "@/lib/payrollShiftRows";
import {
  formatShiftPrefsCloseRule,
  formatShiftPrefsOpenRule,
  formatShiftPrefsWindowRule,
} from "@/lib/shift-deadline";
import {
  formatShiftPrefsMinimumSummary,
  hasShiftPrefsMinimumRules,
} from "@/lib/shift-prefs-minimum";
import { EASE_OUT } from "@/components/motion/shared-motion";
import type { ShiftTemplate, UserRole } from "@/types/database";

const SHIFT_COLORS = ["#eab308", "#fdab3d", "#ef4444", "#7c3aed", "#0d9488", "#2563eb"];

type SettingsPanel = "name" | "location" | "maintenance" | "deadline" | "minimum" | "departments" | "inventoryCategories" | "warehouses" | "shifts";

type ModuleGroup = "identity" | "rules" | "structure";

interface ModuleDef {
  key: SettingsPanel;
  group: ModuleGroup;
  icon: string;
  label: string;
  value: string;
  sub: string;
  /** Configured? Drives the state chip and the readiness meter. */
  ready: boolean;
  /** Excluded from the readiness meter — a rule that is valid either way. */
  optional?: boolean;
  /** Takes two columns on wide grids (bento rhythm). */
  wide?: boolean;
  preview?: ReactNode;
}

const GROUP_META: Record<ModuleGroup, { index: string; title: string; hint: string }> = {
  identity: { index: "01", title: "זהות העסק", hint: "שם ומיקום" },
  rules: { index: "02", title: "כללי עבודה", hint: "אישורים וחלונות" },
  structure: { index: "03", title: "מבנה ותפעול", hint: "מחלקות, מלאי ומשמרות" },
};

const GROUP_ORDER: ModuleGroup[] = ["identity", "rules", "structure"];

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** "HH:MM[:SS]" → minutes past midnight. */
function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Where a shift sits on a 24h track, split in two when it crosses midnight. */
function shiftSegments(t: ShiftTemplate): { left: number; width: number }[] {
  const s = toMinutes(t.start_time);
  const e = toMinutes(t.end_time);
  if (s == null || e == null) return [];
  const pct = (m: number) => (m / 1440) * 100;
  if (e > s) return [{ left: pct(s), width: pct(e - s) }];
  if (e === s) return [{ left: 0, width: 100 }];
  return [
    { left: pct(s), width: pct(1440 - s) },
    { left: 0, width: pct(e) },
  ];
}

/** Days covered by the availability window, wrapping across the week end. */
function windowDays(openDow: number, closeDow: number): Set<number> {
  const out = new Set<number>();
  let d = openDow;
  for (let i = 0; i < 7; i++) {
    out.add(d);
    if (d === closeDow) break;
    d = (d + 1) % 7;
  }
  return out;
}

/** Animated integer — counts up on mount and on every change. */
function useCountUp(value: number, duration = 900): number {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) {
      from.current = value;
      setDisplay(value);
      return;
    }
    const origin = from.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(origin + (value - origin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);

  return display;
}

/** Cursor spotlight — the card reads the pointer through --mx / --my. */
function trackSpotlight(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function Settings() {
  const businessId = useBusinessId();
  const { data: biz, isLoading, isError, refetch } = useBusiness(businessId);
  const { data: departments } = useDepartments(businessId);
  const { data: inventoryCategories } = useInventoryCategories(businessId);
  const { data: warehouses } = useWarehouses(businessId);
  const { data: templates } = useShiftTemplates(businessId);
  const [panel, setPanel] = useState<SettingsPanel | null>(null);
  const close = () => setPanel(null);

  const activeShifts = useMemo(() => (templates ?? []).filter((t) => t.active), [templates]);

  const modules = useMemo<ModuleDef[]>(() => {
    if (!biz) return [];

    const deptCount = departments?.length ?? 0;
    const invCatCount = inventoryCategories?.length ?? 0;
    const warehouseCount = warehouses?.length ?? 0;
    const exemptCount = biz.attendance_geofence_exempt_roles?.length ?? 0;
    const hasCoords = biz.location_lat != null && biz.location_lng != null;
    const radiusM = biz.location_radius_m ?? ATTENDANCE_RADIUS_DEFAULT_M;
    const minRules = hasShiftPrefsMinimumRules({
      minWeekdays: biz.shift_prefs_min_weekdays,
      minWeekend: biz.shift_prefs_min_weekend,
    });
    const openDow = biz.shift_prefs_open_dow;
    const closeDow = biz.shift_prefs_deadline_dow;

    return [
      {
        key: "name",
        group: "identity",
        icon: "storefront",
        label: "שם העסק",
        value: biz.name,
        sub: "דשבורד, דוחות וממשק עובדים",
        ready: Boolean(biz.name?.trim()),
        preview: <BrandPreview name={biz.name} />,
      },
      {
        key: "location",
        group: "identity",
        icon: "my_location",
        label: "כתובת לשעון נוכחות",
        value: biz.location_address?.split(",")[0] ?? "לא הוגדרה",
        sub: hasCoords ? biz.location_address ?? "" : "בחרו כתובת מההשלמה של Google",
        ready: hasCoords,
        wide: true,
        preview: (
          <RadarPreview
            enabled={biz.attendance_geofence_enabled}
            hasCoords={hasCoords}
            radiusM={radiusM}
            exemptCount={exemptCount}
          />
        ),
      },
      {
        key: "maintenance",
        group: "rules",
        icon: "verified_user",
        label: "אישור משימות אחזקה",
        value: biz.maintenance_task_approval ? "דרוש אישור מנהל" : "עובר ישירות",
        sub: "משימות שאחראי משמרת מוריד לאחזקה",
        ready: true,
        optional: true,
        preview: <ApprovalFlowPreview gated={biz.maintenance_task_approval} />,
      },
      {
        key: "deadline",
        group: "rules",
        icon: "event_available",
        label: "חלון הגשה לשבוע הבא",
        value:
          closeDow != null
            ? openDow != null
              ? formatShiftPrefsWindowRule(
                  openDow,
                  biz.shift_prefs_open_time?.slice(0, 5) ?? "21:00",
                  closeDow,
                  biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00"
                )
              : formatShiftPrefsCloseRule(closeDow, biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00")
            : "ללא הגבלה",
        sub: closeDow != null ? "עדכון זמינות ננעל מחוץ לחלון" : "עובדים יכולים לעדכן בכל זמן",
        ready: closeDow != null,
        wide: true,
        preview: (
          <WeekWindowPreview
            openDow={closeDow != null ? openDow : null}
            closeDow={closeDow}
            openTime={biz.shift_prefs_open_time?.slice(0, 5) ?? "21:00"}
            closeTime={biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00"}
          />
        ),
      },
      {
        key: "minimum",
        group: "rules",
        icon: "fact_check",
        label: "מינימום הגשת זמינות",
        value: minRules
          ? formatShiftPrefsMinimumSummary({
              minWeekdays: biz.shift_prefs_min_weekdays,
              minWeekend: biz.shift_prefs_min_weekend,
            })
          : "ללא דרישה",
        sub: "כמה ימים מלאים חובה לסמן בשבוע",
        ready: minRules,
        preview: (
          <MinimumPreview
            weekdays={minRules ? biz.shift_prefs_min_weekdays ?? 0 : 0}
            weekend={minRules ? biz.shift_prefs_min_weekend ?? 0 : 0}
          />
        ),
      },
      {
        key: "departments",
        group: "structure",
        icon: "category",
        label: "מחלקות",
        value: deptCount > 0 ? `${deptCount} ${deptCount === 1 ? "מחלקה" : "מחלקות"}` : "אין מחלקות",
        sub: "סידור עבודה, משימות ושיוך עובדים",
        ready: deptCount > 0,
        preview: (
          <ChipsPreview
            items={(departments ?? []).map((d) => ({ label: d.name, color: d.color ?? "#7c3aed" }))}
            empty="הוסיפו מטבח, בר, מלצרות…"
          />
        ),
      },
      {
        key: "inventoryCategories",
        group: "structure",
        icon: "inventory_2",
        label: "קטגוריות מוצרים",
        value: invCatCount > 0 ? `${invCatCount} ${invCatCount === 1 ? "קטגוריה" : "קטגוריות"}` : "אין קטגוריות",
        sub: "סינון ושיוך מוצרים במלאי",
        ready: invCatCount > 0,
        preview: (
          <ChipsPreview
            items={(inventoryCategories ?? []).map((c) => ({ label: c.name, color: c.color ?? "#8b939e" }))}
            empty="חלבי, יבשים, משקאות…"
          />
        ),
      },
      {
        key: "warehouses",
        group: "structure",
        icon: "warehouse",
        label: "מחסנים",
        value: warehouseCount > 0 ? `${warehouseCount} ${warehouseCount === 1 ? "מחסן" : "מחסנים"}` : "אין מחסנים",
        sub: "כמות נפרדת לכל מוצר בכל מחסן",
        ready: warehouseCount > 0,
        preview: (
          <ChipsPreview
            items={(warehouses ?? []).map((w) => ({ label: w.name, icon: "warehouse" }))}
            empty="מלאי העסק, מחסן בר…"
          />
        ),
      },
      {
        key: "shifts",
        group: "structure",
        icon: "schedule",
        label: "שעות משמרת",
        value: `${activeShifts.length} ${activeShifts.length === 1 ? "משמרת פעילה" : "משמרות פעילות"}`,
        sub: `${templates?.length ?? 0} משמרות מוגדרות בעסק`,
        ready: activeShifts.length > 0,
        wide: true,
        preview: <ShiftTimelinePreview templates={activeShifts} />,
      },
    ];
  }, [biz, departments, inventoryCategories, warehouses, templates, activeShifts]);

  const tracked = modules.filter((m) => !m.optional);
  const readyCount = tracked.filter((m) => m.ready).length;
  const readiness = tracked.length > 0 ? Math.round((readyCount / tracked.length) * 100) : 0;

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
  if (isError || !biz) return <ErrorState onRetry={refetch} />;

  let cardIndex = 0;

  return (
    <div className="stx-page page-enter">
      <SettingsHero
        businessName={biz.name}
        readiness={readiness}
        readyCount={readyCount}
        totalCount={tracked.length}
        stats={[
          { icon: "category", label: "מחלקות", value: departments?.length ?? 0 },
          { icon: "inventory_2", label: "קטגוריות", value: inventoryCategories?.length ?? 0 },
          { icon: "warehouse", label: "מחסנים", value: warehouses?.length ?? 0 },
          { icon: "schedule", label: "משמרות", value: activeShifts.length },
        ]}
      />

      <div className="stx-body">
        <div className="stx-stage">
          {GROUP_ORDER.map((group) => {
            const meta = GROUP_META[group];
            const items = modules.filter((m) => m.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="stx-group">
                <header className="stx-group-head">
                  <span className="stx-group-index" aria-hidden>
                    {meta.index}
                  </span>
                  <h2 className="stx-group-title">{meta.title}</h2>
                  <span className="stx-group-rule" aria-hidden />
                  <span className="stx-group-hint">{meta.hint}</span>
                </header>
                <div className="stx-grid">
                  {items.map((def) => (
                    <ModuleCard key={def.key} def={def} index={cardIndex++} onOpen={() => setPanel(def.key)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="stx-rail">
          <ChecklistCard
            modules={tracked}
            readiness={readiness}
            readyCount={readyCount}
            onOpen={setPanel}
          />
        </aside>
      </div>

      <BusinessNameModal businessId={businessId} open={panel === "name"} onClose={close} />
      <LocationModal businessId={businessId} open={panel === "location"} onClose={close} />
      <MaintenanceApprovalModal businessId={businessId} open={panel === "maintenance"} onClose={close} />
      <ShiftPrefsDeadlineModal businessId={businessId} open={panel === "deadline"} onClose={close} />
      <ShiftPrefsMinimumModal businessId={businessId} open={panel === "minimum"} onClose={close} />
      <DepartmentsModal businessId={businessId} open={panel === "departments"} onClose={close} />
      <InventoryCategoriesModal businessId={businessId} open={panel === "inventoryCategories"} onClose={close} />
      <WarehousesModal businessId={businessId} open={panel === "warehouses"} onClose={close} />
      <ShiftTemplatesModal businessId={businessId} open={panel === "shifts"} onClose={close} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Hero — ink control-room header with a live readiness dial
 * ------------------------------------------------------------------ */

const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;

function SettingsHero({
  businessName,
  readiness,
  readyCount,
  totalCount,
  stats,
}: {
  businessName: string;
  readiness: number;
  readyCount: number;
  totalCount: number;
  stats: { icon: string; label: string; value: number }[];
}) {
  const reduce = useReducedMotion();
  const shownPct = useCountUp(readiness, 1100);
  const complete = readiness === 100;
  const missing = totalCount - readyCount;

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, transform: "translateY(10px)" },
          animate: { opacity: 1, transform: "translateY(0)" },
          transition: { duration: 0.36, delay, ease: EASE_OUT },
        };

  return (
    <header className="stx-hero" aria-label="הגדרות עסק">
      <span className="stx-glow stx-glow--1" data-complete={complete || undefined} aria-hidden />
      <span className="stx-glow stx-glow--2" aria-hidden />
      <span className="stx-grid-lines" aria-hidden />
      <span className="stx-scan" aria-hidden />

      <div className="stx-hero-inner">
        <motion.div className="stx-hero-bar" {...rise(0)}>
          <span className="stx-kicker" data-complete={complete || undefined}>
            <span className="stx-kicker-dot" aria-hidden />
            מרכז הבקרה
          </span>
          <span className="stx-id">
            <span className="stx-id-mono" aria-hidden>
              {businessName.trim().charAt(0) || "•"}
            </span>
            <span className="stx-id-name">{businessName}</span>
          </span>
        </motion.div>

        <div className="stx-hero-main">
          <motion.div className="stx-hero-copy" {...rise(0.06)}>
            <h1 className="stx-title">
              הגדרות <span className="stx-title-em">העסק</span>
            </h1>
            <p className="stx-sub">
              {complete
                ? "כל המודולים מוגדרים — המערכת רצה על הכללים שלכם."
                : `${missing} ${missing === 1 ? "הגדרה ממתינה" : "הגדרות ממתינות"} להשלמה כדי שכל המודולים יעבדו במלואם.`}
            </p>
          </motion.div>

          <motion.div className="stx-dial" data-complete={complete || undefined} {...rise(0.12)}>
            <svg className="stx-ring" viewBox="0 0 80 80" aria-hidden>
              <circle className="stx-ring-track" cx="40" cy="40" r={RING_R} />
              <motion.circle
                className="stx-ring-fill"
                cx="40"
                cy="40"
                r={RING_R}
                strokeDasharray={RING_C}
                initial={reduce ? false : { strokeDashoffset: RING_C }}
                animate={{ strokeDashoffset: RING_C - (RING_C * readiness) / 100 }}
                transition={{ duration: 1.1, delay: 0.3, ease: EASE_OUT }}
              />
            </svg>
            <span className="stx-dial-body">
              <span className="stx-dial-value">{shownPct}%</span>
              <span className="stx-dial-label">מוכנות</span>
            </span>
          </motion.div>
        </div>

        <motion.div className="stx-stats" {...rise(0.18)}>
          {stats.map((s) => (
            <HeroStat key={s.label} {...s} />
          ))}
        </motion.div>
      </div>
    </header>
  );
}

function HeroStat({ icon, label, value }: { icon: string; label: string; value: number }) {
  const shown = useCountUp(value, 800);
  return (
    <span className="stx-stat" data-empty={value === 0 || undefined}>
      <span className="stx-stat-label">
        <Icon name={icon} size={13} />
        {label}
      </span>
      <span className="stx-stat-value">{shown}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Module card
 * ------------------------------------------------------------------ */

function ModuleCard({ def, index, onOpen }: { def: ModuleDef; index: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerMove={trackSpotlight}
      className="stx-card"
      data-ready={def.ready || undefined}
      data-wide={def.wide || undefined}
      style={{ "--i": index } as CSSProperties}
    >
      <span className="stx-card-spot" aria-hidden />
      <span className="stx-card-edge" aria-hidden />

      <span className="stx-card-top">
        <span className="stx-card-icon" aria-hidden>
          <Icon name={def.icon} size={21} />
        </span>
        <span className="stx-card-state">
          <span className="stx-card-state-dot" aria-hidden />
          {def.ready ? "מוגדר" : "ממתין"}
        </span>
      </span>

      <span className="stx-card-label">{def.label}</span>
      <span className="stx-card-value">{def.value}</span>

      {def.preview && <span className="stx-card-preview">{def.preview}</span>}

      <span className="stx-card-foot">
        <span className="stx-card-sub">{def.sub}</span>
        <span className="stx-card-go" aria-hidden>
          <Icon name="chevron_left" size={18} />
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Card previews — each one draws the setting instead of describing it
 * ------------------------------------------------------------------ */

function BrandPreview({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("");

  return (
    <span className="stx-brand">
      <span className="stx-brand-mono" aria-hidden>
        {initials || "•"}
      </span>
      <span className="stx-brand-lines" aria-hidden>
        <span className="stx-brand-line" />
        <span className="stx-brand-line" />
        <span className="stx-brand-line" />
      </span>
    </span>
  );
}

function RadarPreview({
  enabled,
  hasCoords,
  radiusM,
  exemptCount,
}: {
  enabled: boolean;
  hasCoords: boolean;
  radiusM: number;
  exemptCount: number;
}) {
  const live = enabled && hasCoords;
  return (
    <span className="stx-radar-wrap">
      <span className="stx-radar" data-live={live || undefined} aria-hidden>
        <span className="stx-radar-ring stx-radar-ring--3" />
        <span className="stx-radar-ring stx-radar-ring--2" />
        <span className="stx-radar-ring stx-radar-ring--1" />
        {live && <span className="stx-radar-sweep" />}
        <span className="stx-radar-pin" />
        {live && <span className="stx-radar-ping" />}
      </span>
      <span className="stx-radar-facts">
        <span className="stx-fact">
          <Icon name={live ? "gps_fixed" : "gps_off"} size={13} />
          {live ? `רדיוס ${radiusM} מ׳` : "בדיקת GPS כבויה"}
        </span>
        {exemptCount > 0 && (
          <span className="stx-fact">
            <Icon name="badge" size={13} />
            {exemptCount} {exemptCount === 1 ? "תפקיד פטור" : "תפקידים פטורים"}
          </span>
        )}
        {!hasCoords && (
          <span className="stx-fact" data-warn>
            <Icon name="error" size={13} />
            אין נקודת ציון
          </span>
        )}
      </span>
    </span>
  );
}

function ApprovalFlowPreview({ gated }: { gated: boolean }) {
  return (
    <span className="stx-flow" data-gated={gated || undefined} aria-hidden>
      <span className="stx-flow-node">
        <Icon name="engineering" size={15} />
        <span className="stx-flow-cap">אחראי משמרת</span>
      </span>
      <span className="stx-flow-link" />
      <span className="stx-flow-node stx-flow-node--gate">
        <Icon name={gated ? "how_to_reg" : "keyboard_double_arrow_left"} size={15} />
        <span className="stx-flow-cap">{gated ? "אישור מנהל" : "ללא עצירה"}</span>
      </span>
      <span className="stx-flow-link" />
      <span className="stx-flow-node">
        <Icon name="handyman" size={15} />
        <span className="stx-flow-cap">אחזקה</span>
      </span>
    </span>
  );
}

function WeekWindowPreview({
  openDow,
  closeDow,
  openTime,
  closeTime,
}: {
  openDow: number | null | undefined;
  closeDow: number | null | undefined;
  openTime: string;
  closeTime: string;
}) {
  const active = closeDow != null;
  const span = active && openDow != null ? windowDays(openDow, closeDow) : new Set<number>();

  return (
    <span className="stx-week" data-off={!active || undefined}>
      <span className="stx-week-days" aria-hidden>
        {HE_DAYS_SHORT.map((letter, i) => {
          const isOpen = active && openDow === i;
          const isClose = active && closeDow === i;
          return (
            <span
              key={i}
              className="stx-week-day"
              data-in={span.has(i) || undefined}
              data-edge={isOpen ? "open" : isClose ? "close" : undefined}
            >
              {letter}
            </span>
          );
        })}
      </span>
      <span className="stx-week-legend">
        {active ? (
          <>
            <span className="stx-fact">
              <Icon name="lock_open" size={13} />
              {openDow != null ? `${HE_DAYS[openDow]} ${openTime}` : "פתוח תמיד"}
            </span>
            <span className="stx-fact" data-warn>
              <Icon name="lock" size={13} />
              {`${HE_DAYS[closeDow!]} ${closeTime}`}
            </span>
          </>
        ) : (
          <span className="stx-fact">
            <Icon name="all_inclusive" size={13} />
            הטופס פתוח בכל ימות השבוע
          </span>
        )}
      </span>
    </span>
  );
}

function MinimumPreview({ weekdays, weekend }: { weekdays: number; weekend: number }) {
  const rows: { label: string; total: number; filled: number }[] = [
    { label: "א׳–ד׳", total: 4, filled: weekdays },
    { label: "ה׳–ש׳", total: 3, filled: weekend },
  ];

  return (
    <span className="stx-pips" data-off={weekdays + weekend === 0 || undefined}>
      {rows.map((row) => (
        <span key={row.label} className="stx-pips-row">
          <span className="stx-pips-label">{row.label}</span>
          <span className="stx-pips-track" aria-hidden>
            {Array.from({ length: row.total }, (_, i) => (
              <span key={i} className="stx-pip" data-on={i < row.filled || undefined} style={{ "--i": i } as CSSProperties} />
            ))}
          </span>
          <span className="stx-pips-count">{row.filled > 0 ? row.filled : "—"}</span>
        </span>
      ))}
    </span>
  );
}

function ChipsPreview({
  items,
  empty,
}: {
  items: { label: string; color?: string; icon?: string }[];
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <span className="stx-chips" data-empty>
        <span className="stx-chip stx-chip--ghost">
          <Icon name="add" size={13} />
          {empty}
        </span>
      </span>
    );
  }

  const shown = items.slice(0, 4);
  const rest = items.length - shown.length;

  return (
    <span className="stx-chips">
      {shown.map((it, i) => (
        <span key={`${it.label}-${i}`} className="stx-chip" style={{ "--chip-tone": it.color ?? "var(--text-3)" } as CSSProperties}>
          {it.icon ? <Icon name={it.icon} size={13} /> : <span className="stx-chip-dot" aria-hidden />}
          {it.label}
        </span>
      ))}
      {rest > 0 && <span className="stx-chip stx-chip--more">+{rest}</span>}
    </span>
  );
}

function ShiftTimelinePreview({ templates }: { templates: ShiftTemplate[] }) {
  if (templates.length === 0) {
    return (
      <span className="stx-chips" data-empty>
        <span className="stx-chip stx-chip--ghost">
          <Icon name="add" size={13} />
          כל המשמרות כבויות
        </span>
      </span>
    );
  }

  return (
    <span className="stx-tl">
      <span className="stx-tl-track" aria-hidden>
        {[6, 12, 18].map((h) => (
          <span key={h} className="stx-tl-tick" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {templates.slice(0, 6).map((t, ti) =>
          shiftSegments(t).map((seg, si) => (
            <span
              key={`${t.id}-${si}`}
              className="stx-tl-seg"
              style={
                {
                  left: `${seg.left}%`,
                  width: `${Math.max(seg.width, 2)}%`,
                  "--seg-tone": t.color ?? "var(--accent-2)",
                  "--i": ti,
                } as CSSProperties
              }
            />
          ))
        )}
      </span>
      <span className="stx-tl-scale" aria-hidden>
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </span>
      <span className="stx-chips">
        {templates.slice(0, 3).map((t) => (
          <span key={t.id} className="stx-chip" style={{ "--chip-tone": t.color ?? "var(--accent-2)" } as CSSProperties}>
            <span className="stx-chip-dot" aria-hidden />
            {t.name}
            <span className="stx-chip-time">
              {t.start_time?.slice(0, 5)}–{t.end_time?.slice(0, 5)}
            </span>
          </span>
        ))}
        {templates.length > 3 && <span className="stx-chip stx-chip--more">+{templates.length - 3}</span>}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Rail — the setup checklist, every row jumps into its panel
 * ------------------------------------------------------------------ */

function ChecklistCard({
  modules,
  readiness,
  readyCount,
  onOpen,
}: {
  modules: ModuleDef[];
  readiness: number;
  readyCount: number;
  onOpen: (panel: SettingsPanel) => void;
}) {
  const complete = readiness === 100;

  return (
    <div className="stx-check" data-complete={complete || undefined}>
      <div className="stx-check-head">
        <span className="stx-check-icon" aria-hidden>
          <Icon name={complete ? "task_alt" : "rule"} size={19} />
        </span>
        <div className="stx-check-copy">
          <div className="stx-check-title">מצב התצורה</div>
          <div className="stx-check-sub">
            {readyCount} מתוך {modules.length} הגדרות הושלמו
          </div>
        </div>
      </div>

      <div className="stx-check-bar" role="img" aria-label={`${readiness}% הושלם`}>
        <span className="stx-check-fill" style={{ width: `${readiness}%` }} />
      </div>

      <ul className="stx-check-list">
        {modules.map((m, i) => (
          <li key={m.key} style={{ "--i": i } as CSSProperties}>
            <button
              type="button"
              className="stx-check-row"
              data-ready={m.ready || undefined}
              onClick={() => onOpen(m.key)}
            >
              <span className="stx-check-mark" aria-hidden>
                <Icon name={m.ready ? "check" : "add"} size={14} />
              </span>
              <span className="stx-check-text">
                <span className="stx-check-name">{m.label}</span>
                <span className="stx-check-val">{m.value}</span>
              </span>
              <Icon name="chevron_left" size={16} className="stx-check-go" />
            </button>
          </li>
        ))}
      </ul>

      <p className="stx-check-note">
        <Icon name="bolt" size={14} />
        כל שינוי נשמר ומשפיע על כל המשתמשים בעסק מיידית.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Shared modal building blocks
 * ------------------------------------------------------------------ */

function ModalBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

/** Tone-lit switch row — the standard "turn this rule on" control. */
function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: string;
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="stx-toggle" data-on={checked || undefined}>
      <span className="stx-toggle-icon" aria-hidden>
        <Icon name={icon} size={19} />
      </span>
      <span className="stx-toggle-copy">
        <span className="stx-toggle-title">{title}</span>
        {desc && <span className="stx-toggle-desc">{desc}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

/** Seven day pills — replaces a day <select> with something tappable. */
function DayPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (dow: number) => void;
  label: string;
}) {
  return (
    <div className="stx-daypick" role="group" aria-label={label}>
      {HE_DAYS_SHORT.map((letter, i) => (
        <button
          key={i}
          type="button"
          className="stx-daypick-day"
          data-on={value === i || undefined}
          aria-pressed={value === i}
          aria-label={HE_DAYS[i]}
          onClick={() => onChange(i)}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

/** 0..max segmented counter — replaces the "how many days" <select>. */
function CountPicker({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="stx-count" role="group" aria-label={label}>
      {Array.from({ length: max + 1 }, (_, n) => (
        <button
          key={n}
          type="button"
          className="stx-count-opt"
          data-on={value === n || undefined}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
        >
          {n === 0 ? "ללא" : n}
        </button>
      ))}
    </div>
  );
}

/** One editable row in the departments / categories / warehouses lists. */
function EditorRow({
  color,
  icon,
  defaultValue,
  onRename,
  onDelete,
  deleteLabel,
  badge,
}: {
  color?: string;
  icon?: string;
  defaultValue: string;
  onRename: (name: string) => void;
  onDelete?: () => void;
  deleteLabel: string;
  badge?: ReactNode;
}) {
  return (
    <div className="stx-erow" style={{ "--chip-tone": color ?? "var(--text-3)" } as CSSProperties}>
      <span className="stx-erow-mark" aria-hidden>
        {icon ? <Icon name={icon} size={16} /> : <span className="stx-erow-dot" />}
      </span>
      <Input
        className="stx-erow-input"
        defaultValue={defaultValue}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next && next !== defaultValue) onRename(next);
        }}
      />
      {badge}
      {onDelete && (
        <button type="button" onClick={onDelete} className="stx-erow-del" aria-label={deleteLabel}>
          <Icon name="delete" size={18} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

function BusinessNameModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!biz) return null;

  const nameV = name ?? biz.name;
  const unchanged = nameV.trim() === biz.name;

  function handleSave() {
    setMsg(null);
    if (!nameV.trim()) {
      setMsg("יש להזין שם עסק");
      return;
    }
    update.mutate(
      { id: businessId, name: nameV.trim() },
      {
        onSuccess: () => {
          setMsg(null);
          setSaved(true);
        },
        onError: () => setMsg("שמירה נכשלה"),
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="שם העסק"
      subtitle="השם שיוצג בדשבורד, בדוחות ובממשק העובדים"
      icon="storefront"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          <Button icon="save" loading={update.isPending} disabled={unchanged} onClick={handleSave}>
            שמירת שם
          </Button>
        </>
      }
    >
      <ModalBody>
        <div className="stx-namecard">
          <span className="stx-namecard-mono" aria-hidden>
            {nameV.trim().charAt(0) || "•"}
          </span>
          <span className="stx-namecard-text">{nameV.trim() || "שם העסק"}</span>
        </div>
        <label className="block">
          <span className="label-text">שם העסק</span>
          <Input
            className="mt-1.5"
            value={nameV}
            onChange={(e) => {
              setName(e.target.value);
              setMsg(null);
              setSaved(false);
            }}
            placeholder="לדוגמה: בר הים"
          />
        </label>
        {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
        {saved && !msg && !update.isPending && (
          <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
        )}
      </ModalBody>
    </Modal>
  );
}

interface SelfTestResult {
  distanceM: number;
  accuracyM: number;
  lat: number;
  lng: number;
}

/**
 * "Why does it say I'm 3 km away?" — answered on the spot.
 *
 * Almost every geofence complaint is one of two things: the pin sits on the
 * wrong building, or the device handed the browser a network-level guess instead
 * of a GPS fix. This runs the exact measurement the punch clock runs and shows
 * both numbers, so the manager can tell which one it is.
 */
function LocationSelfTest({ lat, lng, radiusM }: { lat: number; lng: number; radiusM: number }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const fix = await getBestPosition();
      setResult({
        distanceM: distanceMeters(fix.lat, fix.lng, lat, lng),
        accuracyM: fix.accuracyM,
        lat: fix.lat,
        lng: fix.lng,
      });
    } catch (e) {
      setError(geolocationFailureMessage(e));
    } finally {
      setTesting(false);
    }
  }

  const unreliable = result ? isUnreliableAccuracy(result.accuracyM) : false;
  const inside = result ? result.distanceM <= radiusM + accuracySlackMeters(result.accuracyM) : false;

  return (
    <div className="stx-block">
      <div className="stx-block-head">
        <Icon name="my_location" size={16} />
        <span>בדיקה מהמכשיר הזה</span>
      </div>
      <p className="stx-block-desc">
        מודד עכשיו את המרחק בין המכשיר לנקודה שנשמרה — בדיוק כמו שההחתמה עושה.
      </p>
      <Button variant="secondary" icon="sensors" loading={testing} onClick={() => void runTest()}>
        בדיקת מיקום
      </Button>

      {error && <p className="mt-2 text-[12.5px] font-semibold text-danger">{error}</p>}

      {result && (
        <div className="mt-2.5 flex flex-col gap-1.5 text-[12.5px] text-text-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={unreliable ? "warning" : inside ? "success" : "danger"}>
              {unreliable ? "המדידה לא אמינה" : inside ? "בתוך הרדיוס" : "מחוץ לרדיוס"}
            </Badge>
            <span>מרחק: {formatDistance(result.distanceM)}</span>
            <span>דיוק: ±{formatDistance(result.accuracyM)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-text-3">
            <span style={{ direction: "ltr" }}>
              {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
            </span>
            <a
              className="font-bold text-accent-2 underline-offset-2 hover:underline"
              href={`https://www.google.com/maps/search/?api=1&query=${result.lat},${result.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              איפה המכשיר חושב שאתם
            </a>
          </div>
          {unreliable && (
            <p className="text-[12px] font-semibold text-warning">
              המכשיר לא נתן מיקום GPS אלא הערכה לפי הרשת — מרחק כזה לא אומר כלום. במחשב זה נורמלי;
              בדקו מהנייד עם GPS דלוק.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LocationModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();
  const [address, setAddress] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [radiusText, setRadiusText] = useState<string | null>(null);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!biz) return null;

  const addressV = address ?? biz.location_address ?? "";
  const addressDirty = address !== null;
  const latV = lat ?? (addressDirty ? null : biz.location_lat);
  const lngV = lng ?? (addressDirty ? null : biz.location_lng);
  const hasCoords = latV != null && lngV != null;
  const geofenceEnabled = biz.attendance_geofence_enabled;
  const exemptRoles = biz.attendance_geofence_exempt_roles ?? [];
  const savedRadiusM = biz.location_radius_m ?? ATTENDANCE_RADIUS_DEFAULT_M;
  const radiusM = radius ?? savedRadiusM;
  const dirty = addressDirty || radiusM !== savedRadiusM;

  function pickRadius(next: number) {
    setRadius(clampAttendanceRadius(next));
    setRadiusText(null);
    setMsg(null);
    setSaved(false);
  }

  function toggleExemptRole(role: UserRole, checked: boolean) {
    const next = checked ? [...exemptRoles, role] : exemptRoles.filter((r) => r !== role);
    update.mutate({ id: businessId, attendance_geofence_exempt_roles: next });
  }

  function handleSave() {
    setMsg(null);
    if (!addressV.trim()) {
      setMsg("יש לבחור כתובת מהרשימה");
      return;
    }
    if (latV == null || lngV == null) {
      setMsg("יש לבחור כתובת מההשלמה האוטומטית של Google");
      return;
    }
    update.mutate(
      {
        id: businessId,
        location_address: addressV.trim(),
        location_lat: latV,
        location_lng: lngV,
        location_radius_m: clampAttendanceRadius(radiusM),
      },
      {
        onSuccess: () => {
          setMsg(null);
          setSaved(true);
          setRadiusText(null);
        },
        onError: () => setMsg("שמירה נכשלה"),
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="כתובת לשעון נוכחות"
      subtitle={
        geofenceEnabled
          ? `עובדים יוכלו להחתים נוכחות רק במרחק של עד ${savedRadiusM} מטר מהכתובת`
          : "בדיקת הרדיוס כבויה — ניתן להחתים מכל מקום"
      }
      icon="my_location"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          <Button
            icon="save"
            loading={update.isPending || resolvingPlace}
            disabled={resolvingPlace || !dirty}
            onClick={handleSave}
          >
            שמירת הגדרות
          </Button>
        </>
      }
    >
      <ModalBody>
        <ToggleRow
          icon="gps_fixed"
          title="דרישת מיקום GPS ברדיוס מהכתובת"
          desc={`החתמה תתאפשר רק בטווח ${savedRadiusM} מטר מהנקודה שנשמרה`}
          checked={geofenceEnabled}
          onChange={(v) => update.mutate({ id: businessId, attendance_geofence_enabled: v })}
        />

        {geofenceEnabled && (
          <div className="stx-block">
            <div className="stx-block-head">
              <Icon name="badge" size={16} />
              <span>פטור מבדיקת רדיוס לפי תפקיד</span>
            </div>
            <p className="stx-block-desc">
              תפקידים שנבחרו יוכלו להחתים נוכחות מכל מקום, גם כשבדיקת GPS פעילה.
            </p>
            <div className="stx-picks">
              {ATTENDANCE_GEOFENCE_EXEMPT_ROLE_OPTIONS.map((role) => {
                const on = exemptRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    className="stx-pick"
                    data-on={on || undefined}
                    aria-pressed={on}
                    onClick={() => toggleExemptRole(role, !on)}
                  >
                    <span className="stx-pick-mark" aria-hidden>
                      <Icon name={on ? "check" : "add"} size={13} />
                    </span>
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="block">
          <span className="label-text">כתובת העסק</span>
          <div className="mt-1.5">
            <AddressAutocomplete
              value={addressV}
              onResolvingChange={setResolvingPlace}
              onChange={(v) => {
                setAddress(v);
                setLat(null);
                setLng(null);
                setMsg(null);
                setSaved(false);
              }}
              onPlaceSelect={(place) => {
                setAddress(place.address);
                setLat(place.lat);
                setLng(place.lng);
                setMsg(null);
                setSaved(false);
              }}
            />
          </div>
        </label>
        {hasCoords && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-3">
            <Badge tone="violet">רדיוס: {radiusM} מ׳</Badge>
            <span style={{ direction: "ltr" }}>
              {latV!.toFixed(6)}, {lngV!.toFixed(6)}
            </span>
            <a
              className="font-bold text-accent-2 underline-offset-2 hover:underline"
              href={`https://www.google.com/maps/search/?api=1&query=${latV},${lngV}`}
              target="_blank"
              rel="noreferrer"
            >
              בדיקת הנקודה במפה
            </a>
          </div>
        )}

        {geofenceEnabled && (
          <div className="stx-block">
            <div className="stx-block-head">
              <Icon name="radar" size={16} />
              <span>רדיוס מותר להחתמה</span>
            </div>
            <p className="stx-block-desc">
              מיקום מהדפדפן מדויק בטווח של עשרות מטרים במקרה הטוב, ובתוך מבנה הרבה פחות. רדיוס
              קטן מדי יחסום עובדים שנמצאים בעסק.
            </p>
            <div className="stx-picks">
              {ATTENDANCE_RADIUS_OPTIONS_M.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="stx-pick"
                  data-on={radiusM === option || undefined}
                  aria-pressed={radiusM === option}
                  onClick={() => pickRadius(option)}
                >
                  <span className="stx-pick-mark" aria-hidden>
                    <Icon name={radiusM === option ? "check" : "add"} size={13} />
                  </span>
                  {option >= 1000 ? `${option / 1000} ק״מ` : `${option} מ׳`}
                </button>
              ))}
            </div>
            <label className="mt-2.5 flex items-center gap-2">
              <span className="label-text shrink-0">ערך מותאם (מ׳)</span>
              <Input
                type="number"
                inputMode="numeric"
                min={ATTENDANCE_RADIUS_MIN_M}
                max={ATTENDANCE_RADIUS_MAX_M}
                className="w-28"
                value={radiusText ?? String(radiusM)}
                onChange={(e) => {
                  setRadiusText(e.target.value);
                  setMsg(null);
                  setSaved(false);
                  const parsed = Number(e.target.value);
                  if (Number.isFinite(parsed) && e.target.value.trim() !== "") {
                    setRadius(clampAttendanceRadius(parsed));
                  }
                }}
                onBlur={() => setRadiusText(null)}
              />
            </label>
            {radiusM < ATTENDANCE_RADIUS_TIGHT_M && (
              <p className="mt-2 text-[12px] font-semibold text-warning">
                מתחת ל-{ATTENDANCE_RADIUS_TIGHT_M} מ׳ סטיית ה-GPS הרגילה תחסום עובדים שנמצאים בעסק.
              </p>
            )}
          </div>
        )}

        {geofenceEnabled && hasCoords && (
          <LocationSelfTest lat={latV!} lng={lngV!} radiusM={radiusM} />
        )}

        {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
        {saved && !msg && !update.isPending && (
          <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
        )}
      </ModalBody>
    </Modal>
  );
}

function MaintenanceApprovalModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();

  if (!biz) return null;

  const enabled = biz.maintenance_task_approval;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="אישור משימות לאיש אחזקה"
      subtitle="משימה שאחראי משמרת מוריד לאיש אחזקה ממתינה לאישור מנהל לפני שהיא מופיעה אצלו"
      icon="verified_user"
      footer={<Button onClick={onClose}>סגירה</Button>}
    >
      <ModalBody>
        <div className="stx-flow-stage">
          <ApprovalFlowPreview gated={enabled} />
        </div>
        <ToggleRow
          icon="verified_user"
          title="דרישת אישור מנהל"
          desc="משימות שאחראי משמרת מוריד לאיש אחזקה יחכו לאישורכם"
          checked={enabled}
          onChange={(v) => update.mutate({ id: businessId, maintenance_task_approval: v })}
        />
      </ModalBody>
    </Modal>
  );
}

function ShiftPrefsDeadlineModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const [openDow, setOpenDow] = useState<number | null>(null);
  const [openTime, setOpenTime] = useState<string | null>(null);
  const [closeDow, setCloseDow] = useState<number | null>(null);
  const [closeTime, setCloseTime] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!biz) return null;

  const isEnabled = draftEnabled ?? biz.shift_prefs_deadline_dow != null;
  const openDowV = openDow ?? biz.shift_prefs_open_dow ?? 6;
  const openTimeV = openTime ?? biz.shift_prefs_open_time?.slice(0, 5) ?? "21:00";
  const closeDowV = closeDow ?? biz.shift_prefs_deadline_dow ?? 2;
  const closeTimeV = closeTime ?? biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00";
  const savedOpenDow = biz.shift_prefs_open_dow ?? 6;
  const savedOpenTime = biz.shift_prefs_open_time?.slice(0, 5) ?? "21:00";
  const savedCloseDow = biz.shift_prefs_deadline_dow ?? 2;
  const savedCloseTime = biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00";
  const unchanged =
    isEnabled === (biz.shift_prefs_deadline_dow != null) &&
    (!isEnabled ||
      (openDowV === savedOpenDow &&
        openTimeV === savedOpenTime &&
        closeDowV === savedCloseDow &&
        closeTimeV === savedCloseTime));

  function touch() {
    setMsg(null);
    setSaved(false);
  }

  function handleToggle(on: boolean) {
    if (!biz) return;
    setMsg(null);
    setSaved(false);
    if (!on) {
      setDraftEnabled(false);
      setOpenDow(null);
      setOpenTime(null);
      setCloseDow(null);
      setCloseTime(null);
      update.mutate({
        id: businessId,
        shift_prefs_open_dow: null,
        shift_prefs_open_time: null,
        shift_prefs_deadline_dow: null,
        shift_prefs_deadline_time: null,
      });
      return;
    }
    setDraftEnabled(true);
    const nextOpenDow = biz.shift_prefs_open_dow ?? 6;
    const nextOpenTime = biz.shift_prefs_open_time?.slice(0, 5) ?? "21:00";
    const nextCloseDow = biz.shift_prefs_deadline_dow ?? 2;
    const nextCloseTime = biz.shift_prefs_deadline_time?.slice(0, 5) ?? "20:00";
    setOpenDow(nextOpenDow);
    setOpenTime(nextOpenTime);
    setCloseDow(nextCloseDow);
    setCloseTime(nextCloseTime);
    if (biz.shift_prefs_deadline_dow == null) {
      update.mutate({
        id: businessId,
        shift_prefs_open_dow: nextOpenDow,
        shift_prefs_open_time: `${nextOpenTime}:00`,
        shift_prefs_deadline_dow: nextCloseDow,
        shift_prefs_deadline_time: `${nextCloseTime}:00`,
      });
    }
  }

  function handleSave() {
    setMsg(null);
    if (!isEnabled) return;
    update.mutate(
      {
        id: businessId,
        shift_prefs_open_dow: openDowV,
        shift_prefs_open_time: `${openTimeV}:00`,
        shift_prefs_deadline_dow: closeDowV,
        shift_prefs_deadline_time: `${closeTimeV}:00`,
      },
      {
        onSuccess: () => {
          setMsg(null);
          setSaved(true);
          setDraftEnabled(null);
          setOpenDow(null);
          setOpenTime(null);
          setCloseDow(null);
          setCloseTime(null);
        },
        onError: () => setMsg("שמירה נכשלה"),
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="חלון הגשה לשבוע הבא"
      subtitle="קבעו מתי נפתח ומתי נסגר חלון עדכון הזמינות לשבוע הבא"
      icon="event_available"
      maxWidth={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          {isEnabled && (
            <Button icon="save" loading={update.isPending} disabled={unchanged} onClick={handleSave}>
              שמירת חלון
            </Button>
          )}
        </>
      }
    >
      <ModalBody>
        <ToggleRow
          icon="event_available"
          title="הגבלת חלון הגשה"
          desc="מחוץ לחלון טופס הזמינות ננעל לעובדים"
          checked={isEnabled}
          onChange={handleToggle}
        />

        {isEnabled && (
          <>
            <div className="stx-window-stage">
              <WeekWindowPreview
                openDow={openDowV}
                closeDow={closeDowV}
                openTime={openTimeV}
                closeTime={closeTimeV}
              />
              <span className="stx-window-rule">
                {formatShiftPrefsWindowRule(openDowV, openTimeV, closeDowV, closeTimeV)} · לשבוע הבא
              </span>
            </div>

            <div className="stx-block">
              <div className="stx-block-head">
                <Icon name="lock_open" size={16} />
                <span>פתיחה</span>
              </div>
              <p className="stx-block-desc">
                {formatShiftPrefsOpenRule(openDowV, openTimeV)} — מרגע זה עובדים יכולים להתחיל לעדכן
              </p>
              <DayPicker
                value={openDowV}
                label="יום פתיחה"
                onChange={(d) => {
                  setOpenDow(d);
                  touch();
                }}
              />
              <label className="stx-timefield">
                <span className="stx-timefield-label">
                  <Icon name="schedule" size={14} />
                  שעת פתיחה
                </span>
                <input
                  type="time"
                  value={openTimeV}
                  onChange={(e) => {
                    setOpenTime(e.target.value);
                    touch();
                  }}
                  className="field stx-time"
                  style={{ direction: "ltr" }}
                />
              </label>
            </div>

            <div className="stx-block">
              <div className="stx-block-head">
                <Icon name="lock" size={16} />
                <span>סגירה</span>
              </div>
              <p className="stx-block-desc">
                {formatShiftPrefsCloseRule(closeDowV, closeTimeV)} — לאחר מכן הטופס ננעל
              </p>
              <DayPicker
                value={closeDowV}
                label="יום סגירה"
                onChange={(d) => {
                  setCloseDow(d);
                  touch();
                }}
              />
              <label className="stx-timefield">
                <span className="stx-timefield-label">
                  <Icon name="schedule" size={14} />
                  שעת סגירה
                </span>
                <input
                  type="time"
                  value={closeTimeV}
                  onChange={(e) => {
                    setCloseTime(e.target.value);
                    touch();
                  }}
                  className="field stx-time"
                  style={{ direction: "ltr" }}
                />
              </label>
            </div>

            <p className="text-[12px] leading-relaxed text-text-3">
              לדוגמה: פתיחה בשבת 21:00 וסגירה בשלישי 20:00 — עובדים יוכלו להגיש זמינות לשבוע הבא רק בין
              שני המועדים.
            </p>

            {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
            {saved && !msg && !update.isPending && (
              <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
            )}
          </>
        )}
      </ModalBody>
    </Modal>
  );
}

function ShiftPrefsMinimumModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: biz } = useBusiness(businessId);
  const update = useUpdateBusiness();
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const [weekdays, setWeekdays] = useState<number | null>(null);
  const [weekend, setWeekend] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!biz) return null;

  const isEnabled =
    draftEnabled ??
    hasShiftPrefsMinimumRules({
      minWeekdays: biz.shift_prefs_min_weekdays,
      minWeekend: biz.shift_prefs_min_weekend,
    });
  const weekdaysV = weekdays ?? biz.shift_prefs_min_weekdays ?? 2;
  const weekendV = weekend ?? biz.shift_prefs_min_weekend ?? 2;
  const savedWeekdays = biz.shift_prefs_min_weekdays ?? 2;
  const savedWeekend = biz.shift_prefs_min_weekend ?? 2;
  const unchanged =
    isEnabled ===
      hasShiftPrefsMinimumRules({
        minWeekdays: biz.shift_prefs_min_weekdays,
        minWeekend: biz.shift_prefs_min_weekend,
      }) &&
    (!isEnabled || (weekdaysV === savedWeekdays && weekendV === savedWeekend));

  function handleToggle(on: boolean) {
    if (!biz) return;
    setMsg(null);
    setSaved(false);
    if (!on) {
      setDraftEnabled(false);
      setWeekdays(null);
      setWeekend(null);
      update.mutate({
        id: businessId,
        shift_prefs_min_weekdays: null,
        shift_prefs_min_weekend: null,
      });
      return;
    }
    setDraftEnabled(true);
    const nextWeekdays = biz.shift_prefs_min_weekdays ?? 2;
    const nextWeekend = biz.shift_prefs_min_weekend ?? 2;
    setWeekdays(nextWeekdays);
    setWeekend(nextWeekend);
    if (
      !hasShiftPrefsMinimumRules({
        minWeekdays: biz.shift_prefs_min_weekdays,
        minWeekend: biz.shift_prefs_min_weekend,
      })
    ) {
      update.mutate({
        id: businessId,
        shift_prefs_min_weekdays: nextWeekdays,
        shift_prefs_min_weekend: nextWeekend,
      });
    }
  }

  function handleSave() {
    setMsg(null);
    if (!isEnabled) return;
    if (weekdaysV < 1 && weekendV < 1) {
      setMsg("יש להגדיר לפחות יום אחד באמצע שבוע או בסופ״ש");
      return;
    }
    update.mutate(
      {
        id: businessId,
        shift_prefs_min_weekdays: weekdaysV > 0 ? weekdaysV : null,
        shift_prefs_min_weekend: weekendV > 0 ? weekendV : null,
      },
      {
        onSuccess: () => {
          setMsg(null);
          setSaved(true);
          setDraftEnabled(null);
          setWeekdays(null);
          setWeekend(null);
        },
        onError: () => setMsg("שמירה נכשלה"),
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="מינימום הגשת זמינות"
      subtitle="קבעו כמה ימים מלאים עובדים חייבים לסמן בכל שבוע — אמצע שבוע (א׳–ד׳) וסופ״ש (ה׳–ש׳)"
      icon="fact_check"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            סגירה
          </Button>
          {isEnabled && (
            <Button icon="save" loading={update.isPending} disabled={unchanged} onClick={handleSave}>
              שמירה
            </Button>
          )}
        </>
      }
    >
      <ModalBody>
        <ToggleRow
          icon="fact_check"
          title="דרישת מינימום ימים"
          desc="יום נחשב מלא כשהעובד סימן את כל המשמרות הפעילות באותו יום"
          checked={isEnabled}
          onChange={handleToggle}
        />

        {isEnabled && (
          <>
            <div className="stx-block">
              <div className="stx-block-head">
                <Icon name="calendar_view_week" size={16} />
                <span>ימים באמצע שבוע (א׳–ד׳)</span>
              </div>
              <CountPicker
                value={weekdaysV}
                max={4}
                label="ימים באמצע שבוע"
                onChange={(n) => {
                  setWeekdays(n);
                  setMsg(null);
                  setSaved(false);
                }}
              />
            </div>

            <div className="stx-block">
              <div className="stx-block-head">
                <Icon name="weekend" size={16} />
                <span>ימים בסופ״ש (ה׳–ש׳)</span>
              </div>
              <CountPicker
                value={weekendV}
                max={3}
                label="ימים בסופ״ש"
                onChange={(n) => {
                  setWeekend(n);
                  setMsg(null);
                  setSaved(false);
                }}
              />
            </div>

            <div className="stx-window-stage">
              <MinimumPreview weekdays={weekdaysV} weekend={weekendV} />
              <span className="stx-window-rule">
                {formatShiftPrefsMinimumSummary({
                  minWeekdays: weekdaysV > 0 ? weekdaysV : null,
                  minWeekend: weekendV > 0 ? weekendV : null,
                })}
              </span>
            </div>

            {msg && <span className="text-[13px] font-semibold text-danger">{msg}</span>}
            {saved && !msg && !update.isPending && (
              <span className="text-[13px] font-semibold text-success">נשמר בהצלחה</span>
            )}
          </>
        )}
      </ModalBody>
    </Modal>
  );
}

function DepartmentsModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: departments } = useDepartments(businessId);
  const create = useCreateDepartment();
  const update = useUpdateDepartment(businessId);
  const del = useDeleteDepartment(businessId);
  const [name, setName] = useState("");

  function add() {
    if (!name.trim()) return;
    create.mutate({
      business_id: businessId,
      name: name.trim(),
      color: SHIFT_COLORS[(departments?.length ?? 0) % SHIFT_COLORS.length],
      sort_order: departments?.length ?? 0,
    });
    setName("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="מחלקות"
      subtitle="מחלקות מגדירות סידור עבודה, משימות ושיוך עובדים"
      icon="category"
      maxWidth={560}
      footer={<Button onClick={onClose}>סגירה</Button>}
    >
      <ModalBody>
        <div className="stx-elist">
          {(departments ?? []).map((d, i) => (
            <div key={d.id} style={{ "--i": i } as CSSProperties} className="stx-elist-item">
              <EditorRow
                color={d.color ?? "#7c3aed"}
                defaultValue={d.name}
                deleteLabel="מחק מחלקה"
                onRename={(n) => update.mutate({ id: d.id, name: n })}
                onDelete={() => del.mutate(d.id)}
              />
            </div>
          ))}
          {departments && departments.length === 0 && (
            <div className="stx-eempty">
              <Icon name="category" size={22} />
              עדיין אין מחלקות — הוסיפו את הראשונה למטה.
            </div>
          )}
        </div>
        <div className="stx-add">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="שם מחלקה חדשה"
          />
          <Button icon="add" loading={create.isPending} onClick={add}>
            הוספה
          </Button>
        </div>
      </ModalBody>
    </Modal>
  );
}

function InventoryCategoriesModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: categories } = useInventoryCategories(businessId);
  const create = useCreateInventoryCategory();
  const update = useUpdateInventoryCategory(businessId);
  const del = useDeleteInventoryCategory(businessId);
  const [name, setName] = useState("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate({
      business_id: businessId,
      name: trimmed,
      color: nextInventoryCategoryColor(categories?.length ?? 0),
      sort_order: categories?.length ?? 0,
    });
    setName("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="קטגוריות מוצרים"
      subtitle="קטגוריות לסינון ולשיוך מוצרים במלאי — לכל עסק רשימה משלו"
      icon="inventory_2"
      maxWidth={560}
      footer={<Button onClick={onClose}>סגירה</Button>}
    >
      <ModalBody>
        <div className="stx-elist">
          {(categories ?? []).map((c, i) => (
            <div key={c.id} style={{ "--i": i } as CSSProperties} className="stx-elist-item">
              <EditorRow
                color={c.color ?? "#8b939e"}
                defaultValue={c.name}
                deleteLabel="מחק קטגוריה"
                onRename={(n) => update.mutate({ id: c.id, name: n })}
                onDelete={() => del.mutate(c.id)}
              />
            </div>
          ))}
          {categories && categories.length === 0 && (
            <div className="stx-eempty">
              <Icon name="inventory_2" size={22} />
              עדיין אין קטגוריות — הוסיפו את הראשונה למטה.
            </div>
          )}
        </div>
        <div className="stx-add">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="שם קטגוריה חדשה"
          />
          <Button icon="add" loading={create.isPending} onClick={add}>
            הוספה
          </Button>
        </div>
        <p className="text-[12px] text-text-3">מחיקת קטגוריה תשאיר מוצרים משויכים אליה ללא קטגוריה.</p>
      </ModalBody>
    </Modal>
  );
}

function WarehousesModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: warehouses } = useWarehouses(businessId);
  const create = useCreateWarehouse();
  const update = useUpdateWarehouse(businessId);
  const del = useDeleteWarehouse(businessId);
  const [name, setName] = useState("");

  function add() {
    const trimmed = name.trim() || ((warehouses?.length ?? 0) === 0 ? DEFAULT_WAREHOUSE_NAME : "");
    if (!trimmed) return;
    create.mutate({
      business_id: businessId,
      name: trimmed,
      sort_order: warehouses?.length ?? 0,
      is_default: (warehouses?.length ?? 0) === 0,
    });
    setName("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="מחסנים"
      subtitle="הגדירו מחסנים לעסק — לכל מוצר ניתן לשמור כמות נפרדת בכל מחסן"
      icon="warehouse"
      maxWidth={560}
      footer={<Button onClick={onClose}>סגירה</Button>}
    >
      <ModalBody>
        <div className="stx-elist">
          {(warehouses ?? []).map((w, i) => (
            <div key={w.id} style={{ "--i": i } as CSSProperties} className="stx-elist-item">
              <EditorRow
                icon="warehouse"
                defaultValue={w.name}
                deleteLabel="מחק מחסן"
                onRename={(n) => update.mutate({ id: w.id, name: n })}
                onDelete={w.is_default ? undefined : () => del.mutate(w.id)}
                badge={
                  w.is_default ? (
                    <Badge tone="neutral" className="shrink-0 text-[11px]">
                      ברירת מחדל
                    </Badge>
                  ) : undefined
                }
              />
            </div>
          ))}
          {warehouses && warehouses.length === 0 && (
            <div className="stx-eempty">
              <Icon name="warehouse" size={22} />
              עדיין אין מחסנים — הוסיפו את הראשון למטה.
            </div>
          )}
        </div>
        <div className="stx-add">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={(warehouses?.length ?? 0) === 0 ? DEFAULT_WAREHOUSE_NAME : "שם מחסן חדש"}
          />
          <Button icon="add" loading={create.isPending} onClick={add}>
            הוספה
          </Button>
        </div>
        <p className="text-[12px] text-text-3">
          {"לא ניתן למחוק את מחסן ברירת המחדל. מחיקת מחסן אפשרית רק אם אין בו רשומות מלאי."}
        </p>
      </ModalBody>
    </Modal>
  );
}

function ShiftTemplatesModal({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: templates } = useShiftTemplates(businessId);
  const create = useCreateShiftTemplate(businessId);
  const update = useUpdateShiftTemplate(businessId);
  const del = useDeleteShiftTemplate(businessId);
  const activeTemplates = (templates ?? []).filter((t) => t.active);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");

  function handleAddShift() {
    if (!newName.trim() || !newStart || !newEnd) return;
    create.mutate(
      {
        business_id: businessId,
        name: newName.trim(),
        start_time: newStart,
        end_time: newEnd,
        color: "#7c3aed",
        sort_order: templates?.length ?? 0,
      },
      {
        onSuccess: () => {
          setNewName("");
          setNewStart("09:00");
          setNewEnd("17:00");
        },
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="שעות משמרת"
      subtitle="כבו משמרות שלא רלוונטיות, ערכו שעות או הוסיפו משמרות מותאמות"
      icon="schedule"
      maxWidth={640}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="settings-active-count !mt-0">
            <Icon name="schedule" size={15} />
            {activeTemplates.length} משמרות פעילות
          </div>
          <Button onClick={onClose}>סגירה</Button>
        </div>
      }
    >
      <ModalBody>
        <div className="stx-window-stage">
          <ShiftTimelinePreview templates={activeTemplates} />
        </div>

        <div className="shift-hours-panel">
          {(templates ?? []).map((t) => {
            const isCustom = t.shift_key == null;
            return (
              <div key={t.id} className="shift-hours-item" data-active={t.active}>
                <Switch checked={t.active} onChange={(v) => update.mutate({ id: t.id, active: v })} />
                <span className="shift-hours-icon" aria-hidden="true">
                  <Icon name="schedule" size={18} />
                </span>
                <Input
                  className="shift-hours-name !bg-surface"
                  defaultValue={t.name}
                  onBlur={(e) => {
                    const n = e.target.value.trim();
                    if (n && n !== t.name) update.mutate({ id: t.id, name: n });
                  }}
                  disabled={!t.active}
                />
                <div className="shift-hours-times">
                  <input
                    type="time"
                    defaultValue={t.start_time?.slice(0, 5)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v && v !== t.start_time?.slice(0, 5)) update.mutate({ id: t.id, start_time: v });
                    }}
                    className="field shift-hours-time-field"
                    style={{ direction: "ltr" }}
                    disabled={!t.active}
                  />
                  <span className="shift-hours-dash">–</span>
                  <input
                    type="time"
                    defaultValue={t.end_time?.slice(0, 5)}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v && v !== t.end_time?.slice(0, 5)) update.mutate({ id: t.id, end_time: v });
                    }}
                    className="field shift-hours-time-field"
                    style={{ direction: "ltr" }}
                    disabled={!t.active}
                  />
                </div>
                {!t.active && <span className="shift-hours-off">כבויה</span>}
                {isCustom ? (
                  <button
                    type="button"
                    onClick={() => del.mutate(t.id)}
                    className="shift-hours-delete"
                    aria-label="מחק משמרת"
                  >
                    <Icon name="delete" size={19} />
                  </button>
                ) : (
                  <span className="w-9 flex-none" />
                )}
              </div>
            );
          })}
        </div>

        <div className="shift-hours-add">
          <span className="shift-hours-add-icon" aria-hidden="true">
            <Icon name="add" size={20} />
          </span>
          <div className="shift-hours-add-fields">
            <Input
              className="shift-hours-add-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="שם משמרת חדשה"
            />
            <div className="shift-hours-times">
              <input
                type="time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="field shift-hours-time-field"
                style={{ direction: "ltr" }}
              />
              <span className="shift-hours-dash">–</span>
              <input
                type="time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="field shift-hours-time-field"
                style={{ direction: "ltr" }}
              />
            </div>
          </div>
          <Button icon="add" loading={create.isPending} onClick={handleAddShift} className="!px-4">
            הוספה
          </Button>
        </div>
      </ModalBody>
    </Modal>
  );
}
