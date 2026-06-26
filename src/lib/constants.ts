import type { FeatureKey, UserRole } from "@/types/database";

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "סופר אדמין",
  manager: "מנהל",
  department_manager: "מנהל מחלקה",
  shift_manager: "מנהל משמרת",
  office_manager: "מנהלת משרד",
  employee: "עובד",
  maintenance: "איש אחזקה",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  super_admin: "ניהול כל הפלטפורמה",
  manager: "סקירה מלאה של העסק",
  department_manager: "בניית סידורי עבודה לכל המחלקות",
  shift_manager: "סידור וחשבוניות",
  office_manager: "שכר ומלאי",
  employee: "משמרות, טפסים, נוכחות",
  maintenance: "תקלות בלבד",
};

/** Roles that can build/edit the work schedule and view all departments' schedules. */
export const SCHEDULER_ROLES: UserRole[] = ["manager", "department_manager", "shift_manager"];

export const ALL_FEATURES: { key: FeatureKey; label: string; icon: string; desc: string }[] = [
  { key: "agreements", label: "הסכמים וחתימה דיגיטלית", icon: "draw", desc: "העלאת הסכמים לחתימה דיגיטלית של העובדים" },
  { key: "forms", label: "טפסים (טופס 101)", icon: "description", desc: "מילוי טופס 101 ומסמכי קליטה במערכת" },
  { key: "shifts", label: "הגשת משמרות וסידור", icon: "calendar_month", desc: "אילוצים שבועיים ובניית סידור עבודה" },
  { key: "payroll", label: "חישוב שכר וטיפים", icon: "payments", desc: "שכר שעתי, טיפים וחישוב אוטומטי" },
  { key: "attendance", label: "שעון נוכחות", icon: "schedule", desc: "החתמת כניסה/יציאה מבוססת מיקום" },
  { key: "inventory", label: "סחורות וניהול מלאי", icon: "inventory_2", desc: "ניהול מלאי והזמנת סחורה לפי צורך" },
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
  { key: "dashboard", label: "דשבורד", icon: "space_dashboard", roles: ["manager", "department_manager", "shift_manager", "office_manager", "employee"] },
  { key: "dashboard", label: "תקלות", icon: "build", roles: ["maintenance"] },
  { key: "platform", label: "סקירת פלטפורמה", icon: "space_dashboard", roles: ["super_admin"] },
  { key: "businesses", label: "עסקים", icon: "store", roles: ["super_admin"] },
  { key: "platform-users", label: "משתמשים", icon: "group", roles: ["super_admin"] },

  { key: "users", label: "משתמשים", icon: "group", roles: ["manager"] },
  { key: "shifts", label: "משמרות", icon: "calendar_month", roles: ["manager", "department_manager", "shift_manager", "employee"], feature: "shifts" },
  { key: "tasks", label: "משימות", icon: "checklist", roles: ["manager", "department_manager", "shift_manager", "office_manager", "employee", "maintenance"], feature: "tasks" },
  { key: "attendance", label: "שעון נוכחות", icon: "schedule", roles: ["manager", "department_manager", "shift_manager", "employee"], feature: "attendance" },
  { key: "payroll", label: "שכר", icon: "payments", roles: ["manager", "office_manager"], feature: "payroll" },
  { key: "inventory", label: "סחורות", icon: "inventory_2", roles: ["manager", "department_manager", "shift_manager", "office_manager", "employee"], feature: "inventory" },
  { key: "faults", label: "תקלות", icon: "build", roles: ["manager", "department_manager", "shift_manager", "employee"], feature: "faults" },
  { key: "agreements", label: "הסכמים", icon: "draw", roles: ["manager", "department_manager", "shift_manager", "office_manager", "employee"], feature: "agreements" },
  { key: "form101", label: "טפסים", icon: "description", roles: ["manager", "department_manager", "shift_manager", "office_manager", "employee"], feature: "forms" },
  { key: "events", label: "אירועים", icon: "celebration", roles: ["manager"], feature: "events" },
  { key: "settings", label: "הגדרות עסק", icon: "settings", roles: ["manager"] },
];

/** Default feature set when creating a new business. */
export const DEFAULT_FEATURE_STATE: Record<FeatureKey, boolean> = {
  agreements: true,
  forms: true,
  shifts: true,
  payroll: true,
  attendance: true,
  inventory: true,
  faults: true,
  events: false,
  tasks: true,
};
