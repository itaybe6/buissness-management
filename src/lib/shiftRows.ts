/**
 * The rows model of the work schedule.
 *
 * A row (shift_template) is a slot for ONE employee per day: a name and an
 * hours range. Two hosts on Monday evening = two "אירוח ערב" rows.
 *
 * Availability is submitted per hours window, not per row, so duplicated rows
 * are one choice for the employee and the mark applies to every row with those
 * hours that day.
 */
import { canAssignEmployeeOnDate, countAssignedDaysInWeek, weekStartFromDateISO } from "@/lib/shift-assignment-limits";
import { shiftSectionKey } from "@/lib/shiftTemplates";
import { dayIndexFromISO, hhmm, hoursOnDay, windowKey } from "@/lib/shiftTemplateHours";
import type {
  Availability,
  Department,
  Profile,
  ShiftAssignment,
  ShiftPreference,
  ShiftTemplate,
  ShiftTemplateDay,
  UserRole,
} from "@/types/database";

export type PrefMark = "available" | "cannot";

/* ----------------------------- who works where ----------------------------- */

/** Roles that staff a management department's rows, whatever department they belong to. */
export const MANAGEMENT_STAFF_ROLES: UserRole[] = ["department_manager", "shift_manager"];

/**
 * Whether a department is the management department. The `is_management`
 * flag decides; before it exists in the database (patch 062 not run yet) a
 * department named "הנהלה" counts as management.
 */
export function isManagementDepartment(department: Pick<Department, "name" | "is_management">): boolean {
  if (typeof department.is_management === "boolean") return department.is_management;
  return (department.name ?? "").includes("הנהלה");
}

export function isManagementStaff(profile: Pick<Profile, "role">): boolean {
  return MANAGEMENT_STAFF_ROLES.includes(profile.role);
}

/**
 * Active people who can be placed in a department's rows: its own employees,
 * and for a management department also every department manager and shift
 * manager in the business.
 */
export function employeesForSection<P extends Pick<Profile, "id" | "active" | "department_id" | "role">>(
  employees: P[],
  department: Pick<Department, "id" | "name" | "is_management">,
): P[] {
  const management = isManagementDepartment(department);
  return employees.filter(
    (e) => e.active && (e.department_id === department.id || (management && isManagementStaff(e))),
  );
}

/**
 * Rows an employee submits availability for and sees in their schedule: their
 * department's rows, plus management rows for department/shift managers.
 */
export function templatesForStaff<T extends Pick<ShiftTemplate, "department_id" | "sort_order">>(
  templates: T[],
  profile: Pick<Profile, "department_id" | "role"> | null | undefined,
  departments: Pick<Department, "id" | "name" | "is_management" | "active">[],
): T[] {
  if (!profile) return [];
  const deptIds = new Set<string>();
  if (profile.department_id) deptIds.add(profile.department_id);
  if (isManagementStaff(profile)) {
    for (const d of departments) if (d.active && isManagementDepartment(d)) deptIds.add(d.id);
  }
  return templates
    .filter((t) => t.department_id !== null && deptIds.has(t.department_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** People without a department who don't show up anywhere in the schedule. */
export function unplacedEmployeeCount(
  employees: Pick<Profile, "active" | "department_id" | "role">[],
  departments: Pick<Department, "name" | "is_management" | "active">[],
): number {
  const hasManagement = departments.some((d) => d.active && isManagementDepartment(d));
  return employees.filter((e) => e.active && !e.department_id && !(hasManagement && isManagementStaff(e))).length;
}

/** Legacy "prefer" counts as "available"; anything else unknown is ignored. */
export function normalizeAvailability(pref: Availability | null | undefined): PrefMark | null {
  if (pref === "prefer" || pref === "available") return "available";
  if (pref === "cannot") return "cannot";
  return null;
}

/* ----------------------------- availability ----------------------------- */

/** One employee's marks: `${windowKey}_${date}` → mark. */
export function buildEmployeePrefMap(prefs: Pick<ShiftPreference, "start_time" | "end_time" | "shift_date" | "preference">[]) {
  const m = new Map<string, PrefMark>();
  for (const p of prefs) {
    const mark = normalizeAvailability(p.preference);
    if (mark && p.start_time && p.end_time) m.set(`${windowKey(p.start_time, p.end_time)}_${p.shift_date}`, mark);
  }
  return m;
}

/** Everyone's marks: `${employeeId}_${windowKey}_${date}` → mark. */
export function buildTeamPrefMap(
  prefs: Pick<ShiftPreference, "employee_id" | "start_time" | "end_time" | "shift_date" | "preference">[],
) {
  const m = new Map<string, PrefMark>();
  for (const p of prefs) {
    const mark = normalizeAvailability(p.preference);
    if (mark && p.start_time && p.end_time) {
      m.set(`${p.employee_id}_${windowKey(p.start_time, p.end_time)}_${p.shift_date}`, mark);
    }
  }
  return m;
}

/** What the employee marked for this row's hours on that date (undefined = nothing / row off that day). */
export function rowPref(
  teamPrefs: Map<string, PrefMark>,
  employeeId: string,
  template: Pick<ShiftTemplate, "start_time" | "end_time" | "days">,
  date: string,
): PrefMark | undefined {
  const hours = hoursOnDay(template, dayIndexFromISO(date));
  if (!hours) return undefined;
  return teamPrefs.get(`${employeeId}_${windowKey(hours.start, hours.end)}_${date}`);
}

/* ----------------------------- assignments ----------------------------- */

/**
 * The schedule grid: who sits in each row on each day (`${templateId}_${date}`),
 * and how many filled cells each department has this week. Assignments to rows
 * that no longer exist are dropped.
 */
export function assignmentsByRowCell(
  assignments: ShiftAssignment[],
  templates: Pick<ShiftTemplate, "id" | "department_id">[],
) {
  const byCell = new Map<string, ShiftAssignment>();
  const weekCounts = new Map<string, number>();
  const tplById = new Map(templates.map((t) => [t.id, t]));
  for (const a of assignments) {
    const tpl = tplById.get(a.shift_template_id);
    if (!tpl) continue;
    const key = `${a.shift_template_id}_${a.shift_date}`;
    // A legacy cell with several people keeps the earliest one on screen.
    const prev = byCell.get(key);
    if (prev && prev.created_at <= a.created_at) continue;
    byCell.set(key, a);
    if (!prev) {
      const sectionKey = shiftSectionKey(tpl.department_id);
      weekCounts.set(sectionKey, (weekCounts.get(sectionKey) ?? 0) + 1);
    }
  }
  return { byCell, weekCounts };
}

export type RowAssignmentPlan =
  | { kind: "noop" }
  | { kind: "insert"; deleteIds: string[] }
  | { kind: "update"; id: string; deleteIds: string[] };

/**
 * How to put `employeeId` into a cell given what is there now. A row holds one
 * employee, so anything else in the cell is replaced (or cleared, for legacy
 * cells that held several people).
 */
export function planRowAssignment(
  existing: Pick<ShiftAssignment, "id" | "employee_id">[],
  employeeId: string,
): RowAssignmentPlan {
  if (existing.length === 0) return { kind: "insert", deleteIds: [] };
  const mine = existing.find((a) => a.employee_id === employeeId);
  if (mine) {
    const deleteIds = existing.filter((a) => a.id !== mine.id).map((a) => a.id);
    return deleteIds.length === 0 ? { kind: "noop" } : { kind: "update", id: mine.id, deleteIds };
  }
  const [keep, ...rest] = existing;
  return { kind: "update", id: keep.id, deleteIds: rest.map((a) => a.id) };
}

/* ----------------------------- picker ----------------------------- */

const PREF_ORDER: Record<PrefMark | "none", number> = { available: 0, none: 1, cannot: 2 };

export interface PickerCandidate {
  employee: Profile;
  pref: PrefMark | undefined;
  /** Already sits in this row on this date. */
  isCurrent: boolean;
  /** Names of other rows the employee is in that day. */
  otherRowsToday: string[];
  assignedDays: number;
  /** Assigning would leave no day off this week. */
  dayOffBlocked: boolean;
}

/**
 * Employees to offer for one cell: who said they can come first, then who did
 * not mark, then who can't; by name inside each group.
 */
export function pickerCandidates(input: {
  employees: Profile[];
  query?: string;
  template: Pick<ShiftTemplate, "id" | "start_time" | "end_time" | "days">;
  date: string;
  currentEmployeeId: string | null;
  assignments: Pick<ShiftAssignment, "employee_id" | "shift_date" | "shift_template_id">[];
  teamPrefs: Map<string, PrefMark>;
  rowNames: Map<string, string>;
}): PickerCandidate[] {
  const { template, date, assignments } = input;
  const q = (input.query ?? "").trim();
  const wk = weekStartFromDateISO(date);
  return input.employees
    .filter((e) => !q || (e.full_name ?? "").includes(q))
    .map((employee) => {
      const isCurrent = input.currentEmployeeId === employee.id;
      return {
        employee,
        pref: rowPref(input.teamPrefs, employee.id, template, date),
        isCurrent,
        otherRowsToday: assignments
          .filter((a) => a.employee_id === employee.id && a.shift_date === date && a.shift_template_id !== template.id)
          .map((a) => input.rowNames.get(a.shift_template_id) ?? "משמרת אחרת"),
        assignedDays: countAssignedDaysInWeek(assignments, employee.id, wk),
        dayOffBlocked: !isCurrent && !canAssignEmployeeOnDate(assignments, employee.id, date),
      };
    })
    .sort(
      (a, b) =>
        PREF_ORDER[a.pref ?? "none"] - PREF_ORDER[b.pref ?? "none"] ||
        (a.employee.full_name ?? "").localeCompare(b.employee.full_name ?? "", "he"),
    );
}

/* ----------------------------- row editor ----------------------------- */

export interface DayHours {
  start: string;
  end: string;
}

export interface RowDraft {
  name: string;
  /** Hours for every day, when `perDay` is off. */
  start: string;
  end: string;
  /** Seven flags, Sunday first. */
  days: boolean[];
  /** Each selected day has its own hours (`dayHours`). */
  perDay?: boolean;
  /** Seven entries, Sunday first; only selected days are read. */
  dayHours?: DayHours[];
}

export type RowDraftError = "name" | "hours" | "same_hours" | "days";

/** The draft the editor opens with: a blank new row, or an existing row with its days and hours. */
export function initialRowDraft(template: Pick<ShiftTemplate, "name" | "start_time" | "end_time" | "days"> | null): RowDraft {
  if (!template) {
    return {
      name: "",
      start: "",
      end: "",
      days: Array(7).fill(false),
      perDay: false,
      dayHours: Array.from({ length: 7 }, () => ({ start: "", end: "" })),
    };
  }
  const start = hhmm(template.start_time);
  const end = hhmm(template.end_time);
  const hours = [0, 1, 2, 3, 4, 5, 6].map((i) => hoursOnDay(template, i));
  const ranges = new Set(hours.filter(Boolean).map((h) => `${h!.start}-${h!.end}`));
  return {
    name: template.name,
    start,
    end,
    days: hours.map((h) => !!h),
    // A row whose days run at different hours opens in per-day mode.
    perDay: ranges.size > 1,
    dayHours: hours.map((h) => h ?? { start, end }),
  };
}

/** Switch between same-hours and per-day, carrying the hours across. */
export function setRowDraftPerDay(draft: RowDraft, perDay: boolean): RowDraft {
  const dayHours = draft.dayHours ?? Array.from({ length: 7 }, () => ({ start: "", end: "" }));
  if (perDay) {
    // Days without hours yet start from the shared range.
    return {
      ...draft,
      perDay,
      dayHours: dayHours.map((h) => (h.start || h.end ? h : { start: draft.start, end: draft.end })),
    };
  }
  // Back to one range: keep the shared one, or take the first selected day's.
  const first = draft.days.findIndex(Boolean);
  const fallback = first >= 0 ? dayHours[first] : { start: "", end: "" };
  return {
    ...draft,
    perDay,
    start: draft.start || fallback.start,
    end: draft.end || fallback.end,
  };
}

/** Why a row can't be saved yet, or null. An end before the start is an overnight row and is fine. */
export function validateRowDraft(draft: RowDraft): RowDraftError | null {
  if (!draft.name.trim()) return "name";
  if (draft.perDay) {
    if (!draft.days.some(Boolean)) return "days";
    const selected = draft.days.flatMap((on, i) => (on ? [draft.dayHours?.[i] ?? { start: "", end: "" }] : []));
    if (selected.some((h) => !h.start || !h.end)) return "hours";
    if (selected.some((h) => hhmm(h.start) === hhmm(h.end))) return "same_hours";
    return null;
  }
  if (!draft.start || !draft.end) return "hours";
  if (hhmm(draft.start) === hhmm(draft.end)) return "same_hours";
  if (!draft.days.some(Boolean)) return "days";
  return null;
}

/**
 * The day rows to save. Per-day mode saves each selected day's own range. In
 * same-hours mode, editing without touching the hours keeps each day's range;
 * newly enabled days and changed hours use the form's range.
 */
export function rowDaysFor(
  template: Pick<ShiftTemplate, "start_time" | "end_time" | "days"> | null,
  draft: Pick<RowDraft, "start" | "end" | "days" | "perDay" | "dayHours">,
): ShiftTemplateDay[] {
  if (draft.perDay) {
    return draft.days.flatMap((on, i) => {
      const h = draft.dayHours?.[i];
      return on && h ? [{ day_of_week: i, start_time: hhmm(h.start), end_time: hhmm(h.end) }] : [];
    });
  }
  const hoursChanged =
    !template || hhmm(draft.start) !== hhmm(template.start_time) || hhmm(draft.end) !== hhmm(template.end_time);
  return draft.days.flatMap((on, i) => {
    if (!on) return [];
    const existing = !hoursChanged && template ? hoursOnDay(template, i) : null;
    return [{ day_of_week: i, start_time: existing?.start ?? hhmm(draft.start), end_time: existing?.end ?? hhmm(draft.end) }];
  });
}

/** The row's headline hours (shown when every day matches): the first saved day's range. */
export function rowHeadlineHours(days: ShiftTemplateDay[], draft: Pick<RowDraft, "start" | "end">): DayHours {
  return days.length > 0 ? { start: days[0].start_time, end: days[0].end_time } : { start: draft.start, end: draft.end };
}

/** The days a row runs, as they are — for duplicating it. */
export function copyRowDays(template: Pick<ShiftTemplate, "start_time" | "end_time" | "days">): ShiftTemplateDay[] {
  return [0, 1, 2, 3, 4, 5, 6].flatMap((i) => {
    const h = hoursOnDay(template, i);
    return h ? [{ day_of_week: i, start_time: h.start, end_time: h.end }] : [];
  });
}

/** Sort order for a row added at the bottom of a department. */
export function nextRowSortOrder(templates: Pick<ShiftTemplate, "sort_order">[]): number {
  return templates.reduce((max, t) => Math.max(max, t.sort_order ?? 0), -1) + 1;
}
