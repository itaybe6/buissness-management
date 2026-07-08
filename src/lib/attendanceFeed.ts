import { addDays } from "@/lib/db";
import type { Attendance, ShiftAssignment, ShiftTemplate } from "@/types/database";

function startTimeMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function clockMinutesFromISO(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export interface AttendanceSession {
  id: string;
  clockIn: string;
  clockOut: string | null;
}

export interface EmployeeAttendanceGroup {
  employeeId: string;
  sessions: AttendanceSession[];
  onShift: boolean;
  sortKey: number;
}

/** Whether a punch overlaps a shift template window (handles overnight shifts). */
export function punchOverlapsShiftWindow(
  clockIn: string,
  clockOut: string | null,
  template: ShiftTemplate,
  now = new Date(),
): boolean {
  const shiftStart = startTimeMinutes(template.start_time);
  let shiftEnd = startTimeMinutes(template.end_time);
  if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;

  const inMin = clockMinutesFromISO(clockIn);
  let outMin = clockOut ? clockMinutesFromISO(clockOut) : clockMinutesFromISO(now.toISOString());
  if (clockOut && outMin <= inMin) outMin += 24 * 60;
  else if (!clockOut && outMin < inMin) outMin += 24 * 60;

  return inMin < shiftEnd && outMin > shiftStart;
}

/** Records with any overlap on the given calendar day (local). */
export function filterAttendanceForCalendarDay(records: Attendance[], today: string): Attendance[] {
  const dayStart = new Date(`${today}T00:00:00`).getTime();
  const dayEnd = new Date(`${addDays(today, 1)}T00:00:00`).getTime();

  return records.filter((r) => {
    if (!r.clock_in) return false;
    const inT = new Date(r.clock_in).getTime();
    const outT = r.clock_out ? new Date(r.clock_out).getTime() : Date.now();
    return inT < dayEnd && outT >= dayStart;
  });
}

/** Keep punches for employees assigned to today's shifts whose times overlap their shift. */
export function filterAttendanceForTodayShift(input: {
  records: Attendance[];
  today: string;
  assignments: ShiftAssignment[];
  templates: ShiftTemplate[];
  shiftsEnabled: boolean;
  now?: Date;
}): Attendance[] {
  const { records, today, assignments, templates, shiftsEnabled, now = new Date() } = input;
  const dayRecords = filterAttendanceForCalendarDay(records, today);

  if (!shiftsEnabled) return dayRecords;

  const todayAssignments = assignments.filter((a) => a.shift_date === today);
  if (todayAssignments.length === 0) return dayRecords;

  const templateById = new Map(templates.map((t) => [t.id, t]));

  return dayRecords.filter((record) => {
    if (!record.clock_in) return false;

    const empAssignments = todayAssignments.filter((a) => a.employee_id === record.employee_id);
    if (empAssignments.length === 0) return false;

    return empAssignments.some((a) => {
      const template = templateById.get(a.shift_template_id);
      if (!template) return true;
      return punchOverlapsShiftWindow(record.clock_in!, record.clock_out, template, now);
    });
  });
}

export function groupAttendanceByEmployee(records: Attendance[]): EmployeeAttendanceGroup[] {
  const map = new Map<string, AttendanceSession[]>();

  for (const r of records) {
    if (!r.clock_in) continue;
    const sessions = map.get(r.employee_id) ?? [];
    sessions.push({ id: r.id, clockIn: r.clock_in, clockOut: r.clock_out });
    map.set(r.employee_id, sessions);
  }

  const groups: EmployeeAttendanceGroup[] = [];
  for (const [employeeId, sessions] of map) {
    sessions.sort((a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime());
    const onShift = sessions.some((s) => !s.clockOut);
    const sortKey = Math.max(...sessions.map((s) => new Date(s.clockOut ?? s.clockIn).getTime()));
    groups.push({ employeeId, sessions, onShift, sortKey });
  }

  groups.sort((a, b) => {
    if (a.onShift !== b.onShift) return a.onShift ? -1 : 1;
    return b.sortKey - a.sortKey;
  });

  return groups;
}

export function formatPunchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}
