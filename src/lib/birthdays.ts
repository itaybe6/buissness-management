import type { Profile } from "@/types/database";

/** Whether a calendar birth date (YYYY-MM-DD) falls on today's month/day. */
export function isBirthdayToday(birthDate: string, ref = new Date()): boolean {
  const parts = birthDate.split("-");
  if (parts.length < 3) return false;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return false;
  return month === ref.getMonth() + 1 && day === ref.getDate();
}

/** Age the person turns on their birthday this year. */
export function birthdayAge(birthDate: string, ref = new Date()): number {
  const year = Number(birthDate.slice(0, 4));
  if (!year) return 0;
  return ref.getFullYear() - year;
}

/** Active employees whose birthday is today. */
export function profilesWithBirthdayToday(profiles: Profile[], ref = new Date()): Profile[] {
  return profiles.filter(
    (p) => p.active && p.birth_date && isBirthdayToday(p.birth_date, ref),
  );
}
