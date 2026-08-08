import type { Attendance, Profile, UserRole } from "@/types/database";

/** Roles that never appear as punchable team members on the live shift. */
const EXCLUDED_FROM_LIVE_SHIFT: ReadonlySet<UserRole> = new Set(["super_admin", "maintenance"]);

/** True when this role may be force-clocked into a live shift. */
export function canBeAddedToLiveShift(role: UserRole | string | null | undefined): boolean {
  return !!role && !EXCLUDED_FROM_LIVE_SHIFT.has(role as UserRole);
}

/** Employee ids with an open punch (clock_out is null) — already on shift. */
export function employeeIdsOnOpenPunch(
  records: Pick<Attendance, "employee_id" | "clock_out">[],
): Set<string> {
  const ids = new Set<string>();
  for (const r of records) {
    if (r.clock_out == null) ids.add(r.employee_id);
  }
  return ids;
}

/**
 * Active profiles who are not currently on an open attendance punch.
 * Excludes maintenance and super_admin. Sorted by name (he-IL).
 */
export function employeesAvailableToAddToShift(
  users: Pick<Profile, "id" | "full_name" | "role" | "active" | "department_id" | "avatar_url">[],
  onShiftEmployeeIds: Iterable<string>,
): typeof users {
  const onShift = onShiftEmployeeIds instanceof Set ? onShiftEmployeeIds : new Set(onShiftEmployeeIds);
  return users
    .filter(
      (u) =>
        u.active &&
        canBeAddedToLiveShift(u.role) &&
        !onShift.has(u.id),
    )
    .slice()
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "he"));
}

/** Case-insensitive name / role filter for the add-to-shift search field. */
export function filterEmployeesBySearch<T extends { full_name: string | null }>(
  employees: T[],
  query: string,
  roleLabel?: (employee: T) => string | null | undefined,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return employees;
  return employees.filter((e) => {
    const name = (e.full_name ?? "").toLowerCase();
    if (name.includes(q)) return true;
    const role = roleLabel?.(e)?.toLowerCase() ?? "";
    return role.includes(q);
  });
}
