import type { Attendance, ShiftAssignment, ShiftTemplate } from "@/types/database";

export const REPORT_DATE = "2026-07-08";
export const BUSINESS_ID = "biz-1";

export const EMP = {
  alice: "emp-alice",
  bob: "emp-bob",
  carol: "emp-carol",
  dave: "emp-dave",
  eve: "emp-eve",
  frank: "emp-frank",
} as const;

export const TEMPLATE = {
  morning: "tpl-morning",
  evening: "tpl-evening",
  night: "tpl-night",
} as const;

export const templates: ShiftTemplate[] = [
  {
    id: TEMPLATE.morning,
    business_id: BUSINESS_ID,
    shift_key: "morning",
    name: "בוקר",
    start_time: "08:00",
    end_time: "16:00",
    color: null,
    active: true,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: TEMPLATE.evening,
    business_id: BUSINESS_ID,
    shift_key: "evening",
    name: "ערב",
    start_time: "18:00",
    end_time: "23:00",
    color: null,
    active: true,
    sort_order: 1,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: TEMPLATE.night,
    business_id: BUSINESS_ID,
    shift_key: "night",
    name: "לילה",
    start_time: "22:00",
    end_time: "02:00",
    color: null,
    active: true,
    sort_order: 2,
    created_at: "2026-01-01T00:00:00Z",
  },
];

let attendanceSeq = 0;

export function assignment(
  employeeId: string,
  shiftTemplateId: string,
  shiftDate = REPORT_DATE,
): ShiftAssignment {
  return {
    id: `asgn-${employeeId}-${shiftTemplateId}`,
    business_id: BUSINESS_ID,
    department_id: "dept-1",
    employee_id: employeeId,
    shift_date: shiftDate,
    shift_template_id: shiftTemplateId,
    assigned_by: "mgr-1",
    created_at: "2026-01-01T00:00:00Z",
  };
}

/** Build clock_in/out on REPORT_DATE using local hours (matches shift overlap logic). */
export function punch(
  employeeId: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  date = REPORT_DATE,
): Attendance {
  const pad = (n: number) => String(n).padStart(2, "0");
  const clockIn = `${date}T${pad(startHour)}:${pad(startMinute)}:00`;
  const clockOut = `${date}T${pad(endHour)}:${pad(endMinute)}:00`;
  attendanceSeq += 1;
  return {
    id: `att-${attendanceSeq}`,
    business_id: BUSINESS_ID,
    employee_id: employeeId,
    clock_in: clockIn,
    clock_out: clockOut,
    clock_in_lat: null,
    clock_in_lng: null,
    within_radius: true,
    created_at: clockIn,
  };
}

export function eveningRosterWorked(): {
  assignments: ShiftAssignment[];
  attendance: Attendance[];
} {
  const ids = [EMP.alice, EMP.bob, EMP.carol, EMP.dave, EMP.eve];
  return {
    assignments: ids.map((id) => assignment(id, TEMPLATE.evening)),
    attendance: ids.map((id) => punch(id, 18, 15, 22, 45)),
  };
}
