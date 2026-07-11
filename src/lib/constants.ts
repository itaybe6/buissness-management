import type { FeatureKey, UserRole, WageType } from "@/types/database";

/** Fixed geofence radius for attendance clock-in (meters). */
export const ATTENDANCE_RADIUS_M = 15;

/** Roles a manager can mark as exempt from attendance geofence checks. */
export const ATTENDANCE_GEOFENCE_EXEMPT_ROLE_OPTIONS: UserRole[] = [
  "manager",
  "shift_manager",
  "office_manager",
  "employee",
  "maintenance",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "סופר אדמין",
  manager: "מנהל",
  shift_manager: "אחראי משמרת",
  office_manager: "מנהלת משרד",
  employee: "עובד",
  maintenance: "איש אחזקה",
};

export const WAGE_TYPE_LABELS: Record<WageType, string> = {
  hourly: "שעתי",
  tips: "טיפים",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: "ניהול כל הפלטפורמה",
  manager: "סקירה מלאה של העסק",
  shift_manager: "סידור עבודה, אילוצים, חשבוניות ודוח סגירת קופה",
  office_manager: "שכר, מלאי וחשבוניות",
  employee: "משמרות, נוכחות",
  maintenance: "תקלות בלבד",
};

/** Roles that can see the employee documents compliance overview. */
export const DOCUMENTS_OVERVIEW_ROLES: UserRole[] = ["manager", "office_manager"];

/** Roles that can create/edit agreement templates. */
export const DOCUMENTS_EDIT_ROLES: UserRole[] = ["manager", "shift_manager"];

/** Roles that can upload and manage office receipts/invoices. */
export const OFFICE_RECEIPTS_ROLES: UserRole[] = ["manager", "office_manager"];

/** Roles that can build/edit the work schedule and view all departments' schedules. */
export const SCHEDULER_ROLES: UserRole[] = ["manager", "shift_manager"];

/** Roles that see the manager tasks UI (fixed templates + assignment). */
export const MANAGER_ROLES: UserRole[] = ["manager", "shift_manager"];

export function canForceEmployeeClockOut(role: UserRole | string | null | undefined): boolean {
  return !!role && MANAGER_ROLES.includes(role as UserRole);
}

/** Roles that can create fixed templates and assign one-time tasks. */
export const TASK_CREATE_ROLES: UserRole[] = ["manager"];

/** Without a department assignment, these roles still see all daily checklist templates. */
export const DAILY_CHECKLIST_ALL_DEPT_ROLES: UserRole[] = ["manager", "shift_manager", "office_manager"];

export const ALL_FEATURES: { key: FeatureKey; label: string; icon: string; desc: string }[] = [
  { key: "agreements", label: "הסכמים וחתימה דיגיטלית", icon: "draw", desc: "העלאת הסכמים לחתימה דיגיטלית של העובדים" },
  { key: "shifts", label: "הגשת משמרות וסידור", icon: "calendar_month", desc: "אילוצים שבועיים ובניית סידור עבודה" },
  { key: "shift_reports", label: "דוח סגירת משמרת", icon: "receipt_long", desc: "סיכום משמרת, חשבוניות, סגירת קופה וטיפים" },
  { key: "payroll", label: "חישוב שכר וטיפים", icon: "payments", desc: "שכר שעתי, טיפים וחישוב אוטומטי" },
  { key: "attendance", label: "שעון נוכחות", icon: "schedule", desc: "החתמת כניסה/יציאה מבוססת מיקום" },
  { key: "inventory", label: "סחורות וניהול מלאי", icon: "inventory_2", desc: "ניהול מלאי והזמנת סחורה לפי צורך" },
  { key: "waste", label: "בלאי", icon: "delete_sweep", desc: "דיווח על בלאי מוצרים והפחתה אוטומטית מהמלאי" },
  { key: "faults", label: "דיווח תקלות", icon: "build", desc: "דיווח תקלות עם צילום ומעקב סטטוס" },
  { key: "events", label: "אירועים", icon: "celebration", desc: "ניהול אירועים פרטיים והזמנות קבוצתיות" },
  { key: "tasks", label: "משימות", icon: "checklist", desc: "משימות חד-פעמיות וקבועות בהיררכיה" },
];

/** Sidebar section ids — order is defined by NAV_GROUP_ORDER. */
export type NavGroupId = "overview" | "platform" | "team" | "shifts" | "ops" | "settings";

export const NAV_GROUP_ORDER: NavGroupId[] = [
  "overview",
  "platform",
  "team",
  "shifts",
  "ops",
  "settings",
];

/** Empty label = no section header (e.g. dashboard alone). */
export const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  overview: "",
  platform: "פלטפורמה",
  team: "צוות",
  shifts: "משמרות ונוכחות",
  ops: "תפעול",
  settings: "הגדרות",
};

export interface NavItem {
  /** route path under the app (e.g. "dashboard", "shifts") */
  key: string;
  label: string;
  icon: string;
  /** sidebar section this item belongs to */
  group: NavGroupId;
  /** roles allowed to see this item */
  roles: UserRole[];
  /** if set, the item only shows when the business has this feature enabled */
  feature?: FeatureKey;
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  items: NavItem[];
}

/** Group filtered nav items into ordered sections (skips empty groups). */
export function groupNavItems(items: NavItem[]): NavGroup[] {
  const byGroup = new Map<NavGroupId, NavItem[]>();
  for (const item of items) {
    const list = byGroup.get(item.group);
    if (list) list.push(item);
    else byGroup.set(item.group, [item]);
  }
  return NAV_GROUP_ORDER.filter((id) => (byGroup.get(id)?.length ?? 0) > 0).map((id) => ({
    id,
    label: NAV_GROUP_LABELS[id],
    items: byGroup.get(id)!,
  }));
}

/**
 * Single source of truth for the dynamic sidebar.
 * The menu is built from this list, filtered by the user's role and the
 * business's enabled features (business_features).
 */
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "דשבורד", icon: "space_dashboard", group: "overview", roles: ["manager", "shift_manager", "office_manager"] },
  { key: "dashboard", label: "בית", icon: "home", group: "overview", roles: ["employee"] },
  { key: "dashboard", label: "תקלות", icon: "build", group: "overview", roles: ["maintenance"] },
  { key: "platform", label: "סקירת פלטפורמה", icon: "space_dashboard", group: "platform", roles: ["super_admin"] },
  { key: "businesses", label: "עסקים", icon: "store", group: "platform", roles: ["super_admin"] },
  { key: "platform-users", label: "משתמשים", icon: "group", group: "platform", roles: ["super_admin"] },

  { key: "users", label: "משתמשים", icon: "group", group: "team", roles: ["manager"] },
  { key: "agreements", label: "מסמכים", icon: "draw", group: "team", roles: ["manager", "shift_manager", "office_manager", "employee"], feature: "agreements" },
  { key: "payroll", label: "שכר", icon: "payments", group: "team", roles: ["manager", "office_manager"], feature: "payroll" },

  { key: "shifts", label: "משמרות", icon: "calendar_month", group: "shifts", roles: ["manager", "shift_manager", "employee"], feature: "shifts" },
  { key: "shift-reports", label: "דוח משמרת", icon: "receipt_long", group: "shifts", roles: ["manager", "shift_manager"], feature: "shift_reports" },
  { key: "attendance", label: "שעון נוכחות", icon: "schedule", group: "shifts", roles: ["manager", "shift_manager", "employee"], feature: "attendance" },
  { key: "my-shifts", label: "המשמרות שלי", icon: "event_available", group: "shifts", roles: ["manager", "shift_manager", "office_manager", "employee", "maintenance"] },

  { key: "tasks", label: "משימות", icon: "checklist", group: "ops", roles: ["manager", "shift_manager", "office_manager", "maintenance"], feature: "tasks" },
  { key: "inventory", label: "סחורות", icon: "inventory_2", group: "ops", roles: ["manager", "shift_manager", "office_manager", "employee", "maintenance"], feature: "inventory" },
  { key: "faults", label: "תקלות", icon: "build", group: "ops", roles: ["manager", "shift_manager", "employee"], feature: "faults" },
  { key: "events", label: "אירועים", icon: "celebration", group: "ops", roles: ["manager"], feature: "events" },

  { key: "settings", label: "הגדרות עסק", icon: "settings", group: "settings", roles: ["manager"] },
];

/** Default landing route after login, per role. */
export function getHomePath(role: UserRole): string {
  if (role === "employee") return "/dashboard";
  if (role === "super_admin") return "/platform";
  return "/dashboard";
}

/** Default feature set when creating a new business. */
export const DEFAULT_FEATURE_STATE: Record<FeatureKey, boolean> = {
  agreements: true,
  shifts: true,
  shift_reports: true,
  payroll: true,
  attendance: true,
  inventory: true,
  waste: true,
  faults: true,
  events: false,
  tasks: true,
};
