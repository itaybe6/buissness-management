// Domain types mirroring the Supabase schema (supabase/schema.sql).

export type UserRole =
  | "super_admin"
  | "manager"
  | "shift_manager"
  | "office_manager"
  | "employee"
  | "maintenance"
  | "event_manager";

export type Availability = "prefer" | "available" | "cannot";
/** How an employee's pay is computed. hourly = hours×rate; tips = tip pool, floored at their hourly_rate. */
export type WageType = "hourly" | "tips";
export type FaultStatus = "needs_handling" | "in_progress" | "handled";
/** Manager approval for maintenance work price on a fault. null = not submitted yet. */
export type FaultPayApproval = "pending" | "approved";
export type AgreementType = "work" | "sexual_harassment" | "other" | "form_101";
export type TaskType = "one_time" | "recurring";
export type TaskStatus = "open" | "in_progress" | "done";
/** Manager-approval state for maintenance tasks. null = no approval needed. */
export type TaskApproval = "pending" | "approved";
export type OrderStatus = "requested" | "ordered" | "received";
/** Kind of action recorded in the inventory audit log (inventory_logs.action). */
export type InventoryAction = "created" | "count" | "edited" | "waste" | "order";

/** Subscription package assigned by the super admin. 'custom' = hand-picked modules. */
export type BusinessPlan = "starter" | "growth" | "full" | "custom";

/** Feature keys that can be toggled per business (business_features.feature_key). */
export type FeatureKey =
  | "agreements"
  | "shifts"
  | "shift_reports"
  | "payroll"
  | "attendance"
  | "inventory"
  | "waste"
  | "faults"
  | "events"
  | "tasks";

export interface Business {
  id: string;
  name: string;
  active: boolean;
  /** Subscription package. Drives the default module set; 'custom' when hand-picked. */
  plan: BusinessPlan;
  /** Seat cap enforced by a DB trigger on profiles. null = unlimited. */
  max_users: number | null;
  /** Super-admin-only note. Never shown to the business's own users. */
  admin_notes: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  location_radius_m: number | null;
  /** When true, employees must clock in within location_radius_m of the business address. */
  attendance_geofence_enabled: boolean;
  /** Roles that may clock in without geofence validation when attendance_geofence_enabled is true. */
  attendance_geofence_exempt_roles: UserRole[];
  /** Require manager approval for tasks a shift manager assigns to a maintenance worker. */
  maintenance_task_approval: boolean;
  /** Day of week (0=Sun … 6=Sat) when next-week availability closes. null = no limit. */
  shift_prefs_deadline_dow: number | null;
  /** Time on shift_prefs_deadline_dow when submissions close (e.g. "20:00:00"). */
  shift_prefs_deadline_time: string | null;
  /** Day of week when submissions open. null = open immediately. Sat eve before the week when dow > close dow. */
  shift_prefs_open_dow: number | null;
  /** Time on shift_prefs_open_dow when submissions open (e.g. "21:00:00"). */
  shift_prefs_open_time: string | null;
  /** Minimum complete weekday days (Sun–Wed) per week. null = no requirement. */
  shift_prefs_min_weekdays: number | null;
  /** Minimum complete weekend days (Thu–Sat) per week. null = no requirement. */
  shift_prefs_min_weekend: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessFeature {
  id: string;
  business_id: string;
  feature_key: FeatureKey;
  enabled: boolean;
}

export interface Department {
  id: string;
  business_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  business_id: string | null;
  department_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  hourly_rate: number | null;
  /** Pay model. For tips employees hourly_rate is the per-shift minimum (top-up floor). */
  wage_type: WageType;
  /** Register-percentage bonus (0 = none). Applied when the employee worked the shift. */
  bonus_pct: number;
  /** Whether the employee has active pension enrollment. */
  pension_active: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Dynamic shift definitions per business (added in the updated schema). */
export type ShiftKey = "morning" | "afternoon" | "evening" | "night";

export interface ShiftTemplate {
  id: string;
  business_id: string;
  shift_key: ShiftKey | null;
  name: string;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  color: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

/** "signature" = draw pad; "text" = typed straight onto the document. */
export type FormFieldKind = "signature" | "text";

/**
 * A fillable box the manager marks on a PDF page. Coordinates are normalized
 * (0..1) relative to the page size, so they render correctly at any zoom.
 */
export interface SignatureField {
  id: string;
  /** 0-based page index in the PDF */
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** missing = "signature" (all boxes were signatures before typed fields existed) */
  kind?: FormFieldKind;
  /** placeholder shown to the employee inside a text box */
  label?: string;
}

export interface AgreementTemplate {
  id: string;
  business_id: string;
  type: AgreementType;
  title: string;
  content: string;
  file_url: string | null;
  /** signature boxes the manager placed on the PDF, per page */
  signature_fields: SignatureField[];
  /** null = fixed template for all employees; set = dynamic per-employee agreement */
  employee_id: string | null;
  is_editable: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgreementSignature {
  id: string;
  business_id: string;
  agreement_id: string;
  employee_id: string;
  agreed: boolean;
  signature_data: string | null;
  /** map of SignatureField.id -> signature image (PNG dataURL), or typed text for text fields */
  field_signatures: Record<string, string>;
  /** flattened, signed PDF with signatures stamped in */
  signed_file_url: string | null;
  signed_at: string | null;
  email_notified_at: string | null;
  created_at: string;
}

/** סריקת תעודת זהות שהעלה העובד */
export interface EmployeeIdCard {
  id: string;
  business_id: string;
  employee_id: string;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface Form101 {
  id: string;
  business_id: string;
  employee_id: string;
  tax_year: number;
  data: Record<string, unknown>;
  submitted: boolean;
  submitted_at: string | null;
  email_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

/** סוג מסמך פיננסי שהועלה ע״י מנהלת המשרד */
export type ReceiptType = "tax_invoice" | "tax_invoice_receipt" | "receipt";

/** חשבונית / קבלה שהועלתה למערכת */
export interface OfficeReceipt {
  id: string;
  business_id: string;
  type: ReceiptType;
  amount: number;
  vendor_name: string;
  vendor_details: string | null;
  supplier_id: string | null;
  document_date: string | null;
  file_url: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** ספק קבוע לעסק */
export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  tax_id: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** מחיר מוצר אצל ספק (ליחידת המידה הראשית של הפריט) */
export interface SupplierItem {
  business_id: string;
  supplier_id: string;
  item_id: string;
  unit_price: number;
  created_at: string;
  updated_at: string;
}

export interface ShiftPreference {
  id: string;
  business_id: string;
  employee_id: string;
  week_start: string;
  shift_date: string;
  shift_template_id: string;
  preference: Availability;
  note: string | null;
  created_at: string;
}

export interface ShiftAssignment {
  id: string;
  business_id: string;
  department_id: string | null;
  employee_id: string;
  shift_date: string;
  shift_template_id: string;
  assigned_by: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  business_id: string;
  employee_id: string;
  clock_in: string | null;
  clock_out: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  within_radius: boolean | null;
  created_at: string;
}

export interface Tip {
  id: string;
  business_id: string;
  employee_id: string;
  shift_date: string;
  shift_template_id: string | null;
  amount: number;
  hours: number | null;
  hourly_from_tips: number | null;
  /** When the tip was generated from a shift report, links back to it. */
  shift_report_id: string | null;
  created_at: string;
}

/** A single tip participant inside a shift report (saved into extra.tip_participants and tips). */
export interface ShiftReportParticipant {
  employee_id: string;
  /** Hours used for tip split (manager may correct attendance). */
  hours: number;
  /** Hours recorded from clock-in/out — display only, not saved to tips. */
  attendance_hours?: number;
  /** Editable work window on the report day (HH:mm). */
  work_start?: string;
  work_end?: string;
}

/** Employee selected for register-percentage salary bonus on a shift report. */
export interface ShiftReportBonusParticipant {
  employee_id: string;
  /** Individual share of total_sales (percent). */
  bonus_pct?: number;
}

/** Persisted bonus payout per employee per shift report (shift_bonuses table). */
export interface ShiftBonus {
  id: string;
  business_id: string;
  employee_id: string;
  shift_report_id: string;
  shift_date: string;
  shift_template_id: string | null;
  amount: number;
  bonus_pct: number;
  sales_base: number;
  created_at: string;
}

/** A dynamic sales counter line (e.g. "קוקטיילים": 36). */
export interface ShiftReportSalesItem {
  label: string;
  count: number;
}

/** Inventory item flagged as out-of-stock on a shift report. */
export interface ShiftReportOutOfStockItem {
  item_id: string;
  name: string;
}

/** Free-form extra payload stored as jsonb on shift_reports. */
export interface ShiftReportExtra {
  tip_participants?: ShiftReportParticipant[];
  /** Employees who receive total_sales × bonus_pct / 100 added to payroll. */
  bonus_participants?: ShiftReportBonusParticipant[];
  /** Selected shift manager profile ids (אחמ״ש — אחד או יותר). */
  manager_ids?: string[];
  /** @deprecated use manager_ids — kept for older reports */
  manager_id?: string;
  /** All workers on the shift (roster for the shift lead). */
  team_members?: ShiftReportParticipant[];
  /** Products selected when urgent inventory toggle is on. */
  out_of_stock_items?: ShiftReportOutOfStockItem[];
  sales_items?: ShiftReportSalesItem[];
  top_seller?: string;
  [key: string]: unknown;
}

/**
 * End-of-shift summary / cash-register closing report filled by the shift lead
 * (אחראי משמרת). Financial fields drive payroll tips; narrative fields capture
 * the team debrief.
 */
export interface ShiftReport {
  id: string;
  business_id: string;
  report_date: string;
  shift_template_id: string | null;
  manager_names: string | null;
  total_sales: number;
  delivery_sales: number;
  avg_per_diner: number;
  total_tips: number;
  service_pct: number;
  tips_hourly: number;
  first_release: string | null;
  energy_level: number | null;
  unusual_events: string | null;
  team_talks: string | null;
  team_voice: string | null;
  daily_tasks_done: boolean;
  urgent_inventory: string | null;
  faults_maintenance: string | null;
  extra: ShiftReportExtra;
  invoice_urls: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRecord {
  id: string;
  business_id: string;
  employee_id: string;
  period_month: string;
  total_hours: number;
  hourly_rate: number;
  total_tips: number;
  total_pay: number;
  created_by: string | null;
  created_at: string;
}

/** Manual monthly payroll fields (office manager). */
export interface PayrollMonthAdjustment {
  id: string;
  business_id: string;
  employee_id: string;
  /** First day of month (YYYY-MM-DD). */
  period_month: string;
  monthly_bonus: number;
  advance: number;
  differences: number;
  updated_by: string | null;
  updated_at: string;
}

export interface InventoryItemDepartment {
  business_id: string;
  item_id: string;
  department_id: string;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  business_id: string;
  name: string;
  unit: string | null;
  /** Individual pieces per main unit (e.g. 24 units per box). null when unit is יחידות. */
  units_per_package: number | null;
  image_url: string | null;
  min_quantity: number;
  /** 0=Sunday … 6=Saturday (JS getDay). null = not set */
  supplier_delivery_day: number | null;
  /** Product category key (dairy, alcohol, dry, etc.) */
  category: string | null;
  active: boolean;
  created_at: string;
}

export interface InventoryCount {
  id: string;
  business_id: string;
  item_id: string;
  employee_id: string | null;
  quantity: number;
  counted_at: string;
}

export interface InventoryOrder {
  id: string;
  business_id: string;
  item_id: string;
  quantity: number;
  /** Units actually received when marked as arrived; null until received. */
  received_quantity: number | null;
  status: OrderStatus;
  ordered_by: string | null;
  batch_id: string | null;
  supplier_id: string | null;
  created_at: string;
}

export interface InventoryWaste {
  id: string;
  business_id: string;
  item_id: string;
  employee_id: string | null;
  quantity: number;
  note: string | null;
  deducted: boolean;
  created_at: string;
}

/** Audit-log entry: who changed an inventory item, what, and when. */
export interface InventoryLog {
  id: string;
  business_id: string;
  item_id: string;
  employee_id: string | null;
  action: InventoryAction;
  previous_qty: number | null;
  new_qty: number | null;
  note: string | null;
  created_at: string;
}

export interface Fault {
  id: string;
  business_id: string;
  reported_by: string | null;
  photo_urls: string[];
  description: string;
  status: FaultStatus;
  assigned_to: string | null;
  status_updated_by: string | null;
  status_updated_at: string | null;
  work_price: number | null;
  pay_employee_id: string | null;
  pay_approval_status: FaultPayApproval | null;
  pay_submitted_at: string | null;
  pay_approved_by: string | null;
  pay_approved_at: string | null;
  created_at: string;
  updated_at: string;
  /** Populated when faults are loaded with profile joins. */
  reporter?: { full_name: string | null } | null;
  status_updater?: { full_name: string | null } | null;
}

export interface EventRecord {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  event_date: string;
  media_urls: string[];
  created_by: string | null;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  business_id: string;
  department_id: string | null;
  title: string;
  description: string | null;
  /** [-1]=כל יום, אחרת תת-קבוצה של 0–6 (ראשון–שבת) */
  recurrence_weekday: number[] | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Task {
  id: string;
  business_id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  assigned_to: string | null;
  assigned_by: string | null;
  due_date: string | null;
  /** [-1]=כל יום, אחרת תת-קבוצה של 0–6 (ראשון–שבת) */
  recurrence_weekday: number[] | null;
  status: TaskStatus;
  approval_status: TaskApproval | null;
  /** @deprecated single photo kept for backward compat — use media_urls. */
  photo_url: string | null;
  media_urls: string[];
  completed_at: string | null;
  last_documented_by: string | null;
  last_documented_at: string | null;
  created_at: string;
  updated_at: string;
}
