// Domain types mirroring the Supabase schema (supabase/schema.sql).

export type UserRole =
  | "super_admin"
  | "manager"
  | "department_manager"
  | "shift_manager"
  | "office_manager"
  | "employee"
  | "maintenance";

export type Availability = "prefer" | "available" | "cannot";
export type FaultStatus = "needs_handling" | "in_progress" | "handled";
export type AgreementType = "work" | "sexual_harassment" | "other";
export type TaskType = "one_time" | "recurring";
export type TaskStatus = "open" | "in_progress" | "done";
export type OrderStatus = "requested" | "ordered" | "received";

/** Feature keys that can be toggled per business (business_features.feature_key). */
export type FeatureKey =
  | "agreements"
  | "forms"
  | "shifts"
  | "payroll"
  | "attendance"
  | "inventory"
  | "faults"
  | "events"
  | "tasks";

export interface Business {
  id: string;
  name: string;
  active: boolean;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  location_radius_m: number | null;
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
  email: string | null;
  phone: string | null;
  role: UserRole;
  hourly_rate: number | null;
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

export interface AgreementTemplate {
  id: string;
  business_id: string;
  type: AgreementType;
  title: string;
  content: string;
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
  signed_at: string | null;
  created_at: string;
}

export interface Form101 {
  id: string;
  business_id: string;
  employee_id: string;
  tax_year: number;
  data: Record<string, unknown>;
  submitted: boolean;
  submitted_at: string | null;
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
  created_at: string;
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

export interface InventoryItem {
  id: string;
  business_id: string;
  name: string;
  unit: string | null;
  image_url: string | null;
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
  status: OrderStatus;
  ordered_by: string | null;
  created_at: string;
}

export interface Fault {
  id: string;
  business_id: string;
  reported_by: string | null;
  photo_url: string | null;
  description: string;
  status: FaultStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRecord {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  event_date: string;
  created_by: string | null;
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  recurrence_weekday: number | null;
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
  recurrence_weekday: number | null;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
