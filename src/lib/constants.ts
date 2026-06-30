import type { FeatureKey, UserRole, WageType } from "@/types/database";

/** Fixed geofence radius for attendance clock-in (meters). */
export const ATTENDANCE_RADIUS_M = 15;

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

export interface NavItem {
  /** route path under the app (e.g. "dashboard", "shifts") */
  key: string;
  label: string;
  icon: string;
  /** roles allowed to see this item */
  roles: UserRole[];
  /** if set, the item only shows when the business has this feature enabled */
  feature?: FeatureKey;
}

/**
 * Single source of truth for the dynamic sidebar.
 * The menu is built from this list, filtered by the user's role and the
 * business's enabled features (business_features).
 */
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "דשבורד", icon: "space_dashboard", roles: ["manager", "shift_manager", "office_manager"] },
  { key: "dashboard", label: "תקלות", icon: "build", roles: ["maintenance"] },
  { key: "platform", label: "סקירת פלטפורמה", icon: "space_dashboard", roles: ["super_admin"] },
  { key: "businesses", label: "עסקים", icon: "store", roles: ["super_admin"] },
  { key: "platform-users", label: "משתמשים", icon: "group", roles: ["super_admin"] },

  { key: "users", label: "משתמשים", icon: "group", roles: ["manager"] },
  { key: "shifts", label: "משמרות", icon: "calendar_month", roles: ["manager", "shift_manager", "employee"], feature: "shifts" },
  { key: "shift-reports", label: "דוח משמרת", icon: "receipt_long", roles: ["manager", "shift_manager"], feature: "shift_reports" },
  { key: "tasks", label: "משימות", icon: "checklist", roles: ["manager", "shift_manager", "office_manager", "employee", "maintenance"], feature: "tasks" },
  { key: "attendance", label: "שעון נוכחות", icon: "schedule", roles: ["manager", "shift_manager", "employee"], feature: "attendance" },
  { key: "payroll", label: "שכר", icon: "payments", roles: ["manager", "office_manager"], feature: "payroll" },
  { key: "inventory", label: "סחורות", icon: "inventory_2", roles: ["manager", "shift_manager", "office_manager", "employee", "maintenance"], feature: "inventory" },
  { key: "faults", label: "תקלות", icon: "build", roles: ["manager", "shift_manager", "employee"], feature: "faults" },
  { key: "agreements", label: "מסמכי עובדים", icon: "draw", roles: ["manager", "shift_manager", "office_manager", "employee"], feature: "agreements" },
  { key: "events", label: "אירועים", icon: "celebration", roles: ["manager"], feature: "events" },
  { key: "settings", label: "הגדרות עסק", icon: "settings", roles: ["manager"] },
];

/** Default landing route after login, per role. */
export function getHomePath(role: UserRole): string {
  if (role === "employee") return "/tasks";
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
