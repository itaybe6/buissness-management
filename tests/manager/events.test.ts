/**
 * המנהל מנהל אירועים — ספירה לאחור, תאריכים ושיוך משימות לאירוע.
 *
 * האירוע מוצג לכל העסק עם ספירה לאחור, ולכן חישוב הימים חייב להיות לפי
 * היום הקלנדרי המקומי — לא לפי שעות. אירוע בשעה 23:00 היום עדיין «היום».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { daysUntilEvent, daysUntilLabel, parseEventDay } from "@/components/events/eventTime";
import { EVENT_MANAGE_ROLES, visibleNavItems } from "@/lib/constants";
import { ALL_FEATURE_KEYS, MODULE_BY_KEY } from "@/lib/features";
import { approvalForAssignee } from "@/lib/taskAssignment";
import { buildTodayTasks } from "@/lib/todayTasks";
import { BUSINESS_ID, DEPT, USER, makeTask } from "../helpers/factories";
import type { FeatureKey, UserRole } from "@/types/database";

const TODAY = "2026-07-08";

afterEach(() => {
  vi.useRealTimers();
});

/** מקפיא את השעון על צהרי 08/07/2026. */
function freezeToday(hour = 12) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 8, hour, 0, 0));
}

describe("פענוח תאריך האירוע", () => {
  it("תאריך יום נקרא כחצות מקומית", () => {
    const d = parseEventDay("2026-07-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
  });

  it("חותמת ISO מלאה נחתכת ליום בלבד", () => {
    const d = parseEventDay("2026-07-08T21:30:00.000Z");
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
  });
});

describe("כמה ימים נשארו לאירוע", () => {
  it("אירוע היום — אפס ימים, גם בערב", () => {
    freezeToday(23);
    expect(daysUntilEvent(TODAY)).toBe(0);
  });

  it("אירוע היום — אפס גם מוקדם בבוקר", () => {
    freezeToday(1);
    expect(daysUntilEvent(TODAY)).toBe(0);
  });

  it("מחר = 1, מחרתיים = 2", () => {
    freezeToday();
    expect(daysUntilEvent("2026-07-09")).toBe(1);
    expect(daysUntilEvent("2026-07-10")).toBe(2);
  });

  it("אירוע שעבר מחזיר מספר שלילי", () => {
    freezeToday();
    expect(daysUntilEvent("2026-07-07")).toBe(-1);
    expect(daysUntilEvent("2026-07-01")).toBe(-7);
  });

  it("אירוע בעוד חודש", () => {
    freezeToday();
    expect(daysUntilEvent("2026-08-08")).toBe(31);
  });

  it("מעבר שנה מחושב נכון", () => {
    freezeToday();
    expect(daysUntilEvent("2027-07-08")).toBe(365);
  });
});

describe("התווית שהמנהל והעובדים רואים", () => {
  it("היום / מחר / אתמול", () => {
    expect(daysUntilLabel(0)).toBe("היום");
    expect(daysUntilLabel(1)).toBe("מחר");
    expect(daysUntilLabel(-1)).toBe("אתמול");
  });

  it("עתיד רחוק", () => {
    expect(daysUntilLabel(5)).toBe("בעוד 5 ימים");
    expect(daysUntilLabel(31)).toBe("בעוד 31 ימים");
  });

  it("עבר רחוק מוצג בלי מינוס", () => {
    expect(daysUntilLabel(-5)).toBe("לפני 5 ימים");
    expect(daysUntilLabel(-31)).toBe("לפני 31 ימים");
  });

  it("שרשור מלא: תאריך → מספר ימים → תווית", () => {
    freezeToday();
    expect(daysUntilLabel(daysUntilEvent("2026-07-09"))).toBe("מחר");
    expect(daysUntilLabel(daysUntilEvent("2026-07-08"))).toBe("היום");
    expect(daysUntilLabel(daysUntilEvent("2026-07-05"))).toBe("לפני 3 ימים");
  });
});

describe("מי מנהל אירועים", () => {
  const ALL_ON = (k: FeatureKey) => ALL_FEATURE_KEYS.includes(k);

  it("מנהל ומנהלת אירועים יוצרים ועורכים אירועים", () => {
    expect(EVENT_MANAGE_ROLES).toEqual(["manager", "event_manager"]);
  });

  it("אחראי משמרת, מנהלת משרד ועובד רואים אירועים אבל לא עורכים", () => {
    for (const role of ["shift_manager", "office_manager", "employee"] as const) {
      expect(visibleNavItems(role, ALL_ON).map((i) => i.key)).toContain("events");
      expect(EVENT_MANAGE_ROLES).not.toContain(role);
    }
  });

  it("איש אחזקה לא רואה אירועים בכלל", () => {
    expect(visibleNavItems("maintenance", ALL_ON).map((i) => i.key)).not.toContain("events");
  });

  it("מנהלת אירועים רואה רק את מסך האירועים", () => {
    expect(visibleNavItems("event_manager", ALL_ON).map((i) => i.key)).toEqual(["events"]);
  });

  it("כיבוי מודול האירועים מעלים אותו מכל התפקידים", () => {
    const off = (k: FeatureKey) => k !== "events";
    const roles: UserRole[] = ["manager", "shift_manager", "office_manager", "employee", "event_manager"];
    for (const role of roles) {
      expect(visibleNavItems(role, off).map((i) => i.key), role).not.toContain("events");
    }
  });

  it("מודול האירועים עצמאי — לא דורש ולא שובר מודול אחר", () => {
    expect(MODULE_BY_KEY.get("events")?.requires).toEqual([]);
    expect(MODULE_BY_KEY.get("events")?.domain).toBe("growth");
  });
});

describe("משימות שמשויכות לאירוע", () => {
  const WEDNESDAY = 3;

  it("משימת אירוע שהוקצתה לעובד מופיעה לו בצ׳ק־ליסט", () => {
    const eventTask = makeTask({
      title: "לסדר כיסאות לאירוע",
      event_id: "evt-1",
      due_date: TODAY,
    });
    const list = buildTodayTasks(BUSINESS_ID, [eventTask], [], USER.employee, DEPT.bar, TODAY, WEDNESDAY, "employee");
    expect(list.map((t) => t.title)).toEqual(["לסדר כיסאות לאירוע"]);
  });

  it("משימת אירוע לאיש אחזקה עוברת דרך אישור המנהל כמו כל משימה", () => {
    const users = [{ id: USER.maintenance, role: "maintenance" as const }];
    expect(
      approvalForAssignee({
        approvalEnabled: true,
        canCreateTasks: true,
        assignedTo: USER.maintenance,
        users,
      }),
    ).toBe("pending");
  });

  it("משימת אירוע של עובד אחר לא מופיעה לי", () => {
    const eventTask = makeTask({ event_id: "evt-1", assigned_to: USER.employee2, due_date: TODAY });
    const list = buildTodayTasks(BUSINESS_ID, [eventTask], [], USER.employee, DEPT.bar, TODAY, WEDNESDAY, "employee");
    expect(list).toEqual([]);
  });
});
