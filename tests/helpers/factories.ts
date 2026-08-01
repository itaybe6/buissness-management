/**
 * מפעל נתוני בדיקה משותף לכל המערכת.
 *
 * כל בונה מחזיר רשומה תקינה מלאה לפי `src/types/database.ts`, עם ברירות מחדל
 * הגיוניות שאפשר לדרוס בשדות שרלוונטיים לבדיקה. כך בדיקה נשארת קריאה
 * ("עובד טיפים בלי תעריף") במקום להעתיק 15 שדות בכל מקרה.
 */
import type {
  AgreementSignature,
  AgreementTemplate,
  Attendance,
  Business,
  Department,
  Fault,
  InventoryCategory,
  InventoryItem,
  InventoryOrder,
  InventoryWaste,
  OfficeReceipt,
  PayrollMonthAdjustment,
  Profile,
  ShiftAssignment,
  ShiftBonus,
  ShiftPreference,
  ShiftTemplate,
  Supplier,
  Task,
  TaskTemplate,
  Tip,
  UserRole,
  Warehouse,
  WarehouseStock,
} from "@/types/database";
import type { ItemWithQty } from "@/api/inventory";

export const BUSINESS_ID = "biz-1";
export const OTHER_BUSINESS_ID = "biz-2";

/** מחלקות לדוגמה */
export const DEPT = {
  bar: "dept-bar",
  kitchen: "dept-kitchen",
  service: "dept-service",
} as const;

/** משתמשים לדוגמה — אחד לכל תפקיד + עובדים נוספים */
export const USER = {
  manager: "usr-manager",
  shiftManager: "usr-shift-manager",
  officeManager: "usr-office-manager",
  employee: "usr-employee",
  employee2: "usr-employee-2",
  employee3: "usr-employee-3",
  maintenance: "usr-maintenance",
  eventManager: "usr-event-manager",
  superAdmin: "usr-super-admin",
} as const;

export const TPL = {
  morning: "tpl-morning",
  afternoon: "tpl-afternoon",
  evening: "tpl-evening",
  night: "tpl-night",
} as const;

export const WAREHOUSE = {
  main: "wh-main",
  bar: "wh-bar",
} as const;

let seq = 0;
/** מזהה ייחודי ויציב בתוך ריצה אחת (לא רנדומלי — בדיקות דטרמיניסטיות). */
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/** איפוס המונה — לשימוש ב-beforeEach כשמזהים נבדקים במפורש. */
export function resetIdSeq(): void {
  seq = 0;
}

const T0 = "2026-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// עסק, מחלקות ומשתמשים
// ---------------------------------------------------------------------------

export function makeBusiness(over: Partial<Business> = {}): Business {
  return {
    id: BUSINESS_ID,
    name: "מסעדת הבדיקה",
    active: true,
    plan: "growth",
    max_users: null,
    admin_notes: null,
    location_lat: 32.0853,
    location_lng: 34.7818,
    location_address: "רוטשילד 1, תל אביב",
    location_radius_m: 15,
    attendance_geofence_enabled: false,
    attendance_geofence_exempt_roles: [],
    maintenance_task_approval: false,
    shift_prefs_deadline_dow: null,
    shift_prefs_deadline_time: null,
    shift_prefs_open_dow: null,
    shift_prefs_open_time: null,
    shift_prefs_min_weekdays: null,
    shift_prefs_min_weekend: null,
    created_by: USER.superAdmin,
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

export function makeDepartment(over: Partial<Department> = {}): Department {
  return {
    id: DEPT.bar,
    business_id: BUSINESS_ID,
    name: "בר",
    color: "#7c3aed",
    sort_order: 0,
    active: true,
    created_at: T0,
    ...over,
  };
}

export function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    id: USER.employee,
    business_id: BUSINESS_ID,
    department_id: DEPT.bar,
    full_name: "עובד בדיקה",
    avatar_url: null,
    email: "employee@test.local",
    phone: null,
    role: "employee",
    hourly_rate: 35.4,
    wage_type: "hourly",
    bonus_pct: 0,
    pension_active: false,
    birth_date: null,
    active: true,
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

/** פרופיל לכל תפקיד — בסיס למטריצת ההרשאות. */
export function makeProfileForRole(role: UserRole, over: Partial<Profile> = {}): Profile {
  const idByRole: Record<UserRole, string> = {
    super_admin: USER.superAdmin,
    manager: USER.manager,
    shift_manager: USER.shiftManager,
    office_manager: USER.officeManager,
    employee: USER.employee,
    maintenance: USER.maintenance,
    event_manager: USER.eventManager,
  };
  return makeProfile({
    id: idByRole[role],
    role,
    business_id: role === "super_admin" ? null : BUSINESS_ID,
    department_id: role === "employee" ? DEPT.bar : null,
    ...over,
  });
}

/** עובד שעתי עם תעריף. */
export function hourlyEmployee(id: string, rate = 40, over: Partial<Profile> = {}): Profile {
  return makeProfile({ id, wage_type: "hourly", hourly_rate: rate, ...over });
}

/** עובד טיפים — hourly_rate הוא רצפת המינימום למשמרת. */
export function tipsEmployee(id: string, minimumRate = 35.4, over: Partial<Profile> = {}): Profile {
  return makeProfile({ id, wage_type: "tips", hourly_rate: minimumRate, ...over });
}

// ---------------------------------------------------------------------------
// משמרות ונוכחות
// ---------------------------------------------------------------------------

export function makeShiftTemplate(over: Partial<ShiftTemplate> = {}): ShiftTemplate {
  return {
    id: TPL.morning,
    business_id: BUSINESS_ID,
    shift_key: "morning",
    name: "בוקר",
    start_time: "08:00",
    end_time: "16:00",
    color: "#eab308",
    active: true,
    sort_order: 0,
    created_at: T0,
    ...over,
  };
}

/** ארבע משמרות סטנדרטיות, כולל לילה חוצה חצות. */
export const shiftTemplates: ShiftTemplate[] = [
  makeShiftTemplate({ id: TPL.morning, shift_key: "morning", name: "בוקר", start_time: "08:00", end_time: "16:00", sort_order: 0 }),
  makeShiftTemplate({ id: TPL.afternoon, shift_key: "afternoon", name: "צהריים", start_time: "11:00", end_time: "19:00", sort_order: 1 }),
  makeShiftTemplate({ id: TPL.evening, shift_key: "evening", name: "ערב", start_time: "18:00", end_time: "23:00", sort_order: 2 }),
  makeShiftTemplate({ id: TPL.night, shift_key: "night", name: "לילה", start_time: "22:00", end_time: "06:00", sort_order: 3 }),
];

export function makeAssignment(over: Partial<ShiftAssignment> = {}): ShiftAssignment {
  const employee_id = over.employee_id ?? USER.employee;
  const shift_date = over.shift_date ?? "2026-07-08";
  const shift_template_id = over.shift_template_id ?? TPL.evening;
  return {
    id: `asgn-${employee_id}-${shift_date}-${shift_template_id}`,
    business_id: BUSINESS_ID,
    department_id: DEPT.bar,
    employee_id,
    shift_date,
    shift_template_id,
    assigned_by: USER.manager,
    created_at: T0,
    ...over,
  };
}

export function makePreference(over: Partial<ShiftPreference> = {}): ShiftPreference {
  const employee_id = over.employee_id ?? USER.employee;
  const shift_date = over.shift_date ?? "2026-07-08";
  const shift_template_id = over.shift_template_id ?? TPL.evening;
  return {
    id: `pref-${employee_id}-${shift_date}-${shift_template_id}`,
    business_id: BUSINESS_ID,
    employee_id,
    week_start: "2026-07-05",
    shift_date,
    shift_template_id,
    preference: "available",
    note: null,
    created_at: T0,
    ...over,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * החתמת נוכחות מקומית. שעת סיום הקטנה משעת ההתחלה מתגלגלת ליום הבא —
 * כך משמרת לילה מיוצגת כמו בייצור ולא כטווח שלילי.
 */
export function makeAttendance(input: {
  employeeId?: string;
  date?: string;
  from?: number;
  to?: number | null;
  id?: string;
  withinRadius?: boolean | null;
  lat?: number | null;
  lng?: number | null;
}): Attendance {
  const {
    employeeId = USER.employee,
    date = "2026-07-08",
    from = 18,
    to = 23,
    withinRadius = true,
    lat = null,
    lng = null,
  } = input;

  const toISO = (hour: number, onDate: string) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${onDate}T${pad(h)}:${pad(m)}:00`;
  };

  const clockIn = toISO(from, date);
  let clockOut: string | null = null;
  if (to != null) {
    const rollsOver = to <= from;
    clockOut = toISO(to, rollsOver ? addIsoDays(date, 1) : date);
  }

  return {
    id: input.id ?? nextId("att"),
    business_id: BUSINESS_ID,
    employee_id: employeeId,
    clock_in: clockIn,
    clock_out: clockOut,
    clock_in_lat: lat,
    clock_in_lng: lng,
    within_radius: withinRadius,
    created_at: clockIn,
  };
}

/** החתמה פתוחה — נכנס ולא יצא. */
export function makeOpenAttendance(employeeId: string, date: string, from: number): Attendance {
  return makeAttendance({ employeeId, date, from, to: null });
}

/** חיבור ימים ל-ISO date ללא תלות באזור זמן. */
export function addIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// שכר
// ---------------------------------------------------------------------------

export function makeTip(over: Partial<Tip> = {}): Tip {
  return {
    id: nextId("tip"),
    business_id: BUSINESS_ID,
    employee_id: USER.employee,
    shift_date: "2026-07-08",
    shift_template_id: TPL.evening,
    amount: 400,
    hours: 8,
    hourly_from_tips: 50,
    shift_report_id: null,
    created_at: T0,
    ...over,
  };
}

export function makeShiftBonus(over: Partial<ShiftBonus> = {}): ShiftBonus {
  return {
    id: nextId("bonus"),
    business_id: BUSINESS_ID,
    employee_id: USER.shiftManager,
    shift_report_id: "rep-1",
    shift_date: "2026-07-08",
    shift_template_id: TPL.evening,
    amount: 120,
    bonus_pct: 1,
    sales_base: 12000,
    created_at: T0,
    ...over,
  };
}

export function makePayrollAdjustment(over: Partial<PayrollMonthAdjustment> = {}): PayrollMonthAdjustment {
  return {
    id: nextId("adj"),
    business_id: BUSINESS_ID,
    employee_id: USER.employee,
    period_month: "2026-07-01",
    monthly_bonus: 0,
    advance: 0,
    differences: 0,
    updated_by: USER.officeManager,
    updated_at: T0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// משימות
// ---------------------------------------------------------------------------

export function makeTaskTemplate(over: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: nextId("tpl-task"),
    business_id: BUSINESS_ID,
    department_id: DEPT.bar,
    title: "ניקוי הבר",
    description: null,
    recurrence_weekday: [-1],
    active: true,
    sort_order: 0,
    created_at: T0,
    ...over,
  };
}

export function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: nextId("task"),
    business_id: BUSINESS_ID,
    template_id: null,
    event_id: null,
    department_id: null,
    title: "משימה",
    description: null,
    type: "one_time",
    assigned_to: USER.employee,
    assigned_by: USER.manager,
    due_date: "2026-07-08",
    recurrence_weekday: null,
    status: "open",
    approval_status: null,
    photo_url: null,
    media_urls: [],
    completed_at: null,
    last_documented_by: null,
    last_documented_at: null,
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// מלאי, ספקים ומחסנים
// ---------------------------------------------------------------------------

export function makeWarehouse(over: Partial<Warehouse> = {}): Warehouse {
  return {
    id: WAREHOUSE.main,
    business_id: BUSINESS_ID,
    name: "מלאי העסק",
    sort_order: 0,
    is_default: true,
    active: true,
    created_at: T0,
    ...over,
  };
}

export function makeWarehouseStock(over: Partial<WarehouseStock> = {}): WarehouseStock {
  return {
    warehouse_id: WAREHOUSE.main,
    warehouse_name: "מלאי העסק",
    quantity: 10,
    last_updated_at: T0,
    last_updated_by: USER.employee,
    last_updated_by_name: "עובד בדיקה",
    ...over,
  };
}

export function makeInventoryItem(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: nextId("item"),
    business_id: BUSINESS_ID,
    name: "בירה",
    barcode: null,
    unit: "ארגז",
    units_per_package: 24,
    image_url: null,
    min_quantity: 5,
    category_id: null,
    active: true,
    created_at: T0,
    ...over,
  };
}

export function makeItemWithQty(over: Partial<ItemWithQty> = {}): ItemWithQty {
  const base = makeInventoryItem(over as Partial<InventoryItem>);
  return {
    ...base,
    department_ids: [],
    warehouse_stocks: [makeWarehouseStock()],
    current_qty: 10,
    ordered_qty: 0,
    last_updated_by: USER.employee,
    last_updated_at: T0,
    last_updated_by_name: "עובד בדיקה",
    ...over,
  };
}

export function makeInventoryCategory(over: Partial<InventoryCategory> = {}): InventoryCategory {
  return {
    id: nextId("cat"),
    business_id: BUSINESS_ID,
    name: "משקאות",
    color: "#4b93f7",
    sort_order: 0,
    active: true,
    created_at: T0,
    ...over,
  };
}

export function makeOrder(over: Partial<InventoryOrder> = {}): InventoryOrder {
  return {
    id: nextId("order"),
    business_id: BUSINESS_ID,
    item_id: "item-1",
    quantity: 10,
    received_quantity: null,
    status: "requested",
    ordered_by: USER.officeManager,
    batch_id: null,
    supplier_id: null,
    created_at: T0,
    ...over,
  };
}

export function makeSupplier(over: Partial<Supplier> = {}): Supplier {
  return {
    id: nextId("sup"),
    business_id: BUSINESS_ID,
    name: "ספק המשקאות",
    phone: "03-1234567",
    tax_id: null,
    notes: null,
    delivery_days: null,
    active: true,
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

export function makeWaste(over: Partial<InventoryWaste> = {}): InventoryWaste {
  return {
    id: nextId("waste"),
    business_id: BUSINESS_ID,
    item_id: "item-1",
    employee_id: USER.employee,
    quantity: 2,
    note: null,
    deducted: true,
    created_at: T0,
    ...over,
  };
}

export function makeOfficeReceipt(over: Partial<OfficeReceipt> = {}): OfficeReceipt {
  return {
    id: nextId("receipt"),
    business_id: BUSINESS_ID,
    type: "tax_invoice",
    amount: 1200,
    vendor_name: "ספק המשקאות",
    vendor_details: null,
    supplier_id: null,
    document_date: "2026-07-08",
    file_url: "https://files.local/receipt.pdf",
    notes: null,
    created_by: USER.officeManager,
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// תקלות (איש אחזקה)
// ---------------------------------------------------------------------------

export function makeFault(over: Partial<Fault> = {}): Fault {
  return {
    id: nextId("fault"),
    business_id: BUSINESS_ID,
    reported_by: USER.shiftManager,
    photo_urls: [],
    description: "מקרר לא מקרר",
    status: "needs_handling",
    assigned_to: null,
    status_updated_by: null,
    status_updated_at: null,
    work_price: null,
    pay_employee_id: null,
    pay_approval_status: null,
    pay_submitted_at: null,
    pay_approved_by: null,
    pay_approved_at: null,
    created_at: "2026-07-08T10:00:00.000Z",
    updated_at: "2026-07-08T10:00:00.000Z",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// מסמכים
// ---------------------------------------------------------------------------

export function makeAgreement(over: Partial<AgreementTemplate> = {}): AgreementTemplate {
  return {
    id: nextId("agr"),
    business_id: BUSINESS_ID,
    type: "work",
    title: "הסכם עבודה",
    content: "",
    file_url: "https://files.local/agreement.pdf",
    signature_fields: [],
    employee_id: null,
    is_editable: false,
    created_by: USER.manager,
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

export function makeSignature(over: Partial<AgreementSignature> = {}): AgreementSignature {
  return {
    id: nextId("sig"),
    business_id: BUSINESS_ID,
    agreement_id: "agr-1",
    employee_id: USER.employee,
    agreed: true,
    signature_data: null,
    field_signatures: {},
    signed_file_url: null,
    signed_at: "2026-07-08T12:00:00.000Z",
    email_notified_at: null,
    created_at: T0,
    ...over,
  };
}
