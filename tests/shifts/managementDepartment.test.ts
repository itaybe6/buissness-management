/**
 * מחלקת הנהלה בסידור.
 *
 * בשורות של מחלקת הנהלה משבצים מנהלי מחלקה ואחראי משמרת מכל העסק — גם
 * כשהם שייכים למחלקה אחרת. אחראי משמרת מגיש אילוצים גם לשורות האלה.
 * מחלקה רגילה ממשיכה להציג רק את העובדים שלה.
 */
import { describe, expect, it } from "vitest";
import {
  buildTeamPrefMap,
  employeesForSection,
  isManagementDepartment,
  isManagementStaff,
  pickerCandidates,
  templatesForStaff,
  unplacedEmployeeCount,
} from "@/lib/shiftRows";
import { windowsOnDay } from "@/lib/shiftTemplateHours";
import { DEPT, makeDepartment, makePreference, makeProfile, makeShiftTemplate } from "../helpers/factories";

const MGMT = "dept-mgmt";
const MON = "2026-07-13";

const mgmt = makeDepartment({ id: MGMT, name: "הנהלה", is_management: true });
const barDept = makeDepartment({ id: DEPT.bar, name: "בר" });
const kitchenDept = makeDepartment({ id: DEPT.kitchen, name: "מטבח" });
const departments = [mgmt, barDept, kitchenDept];

const barShiftLead = makeProfile({ id: "sl-bar", full_name: "אחראית בר", role: "shift_manager", department_id: DEPT.bar });
const kitchenHead = makeProfile({ id: "dm-kitchen", full_name: "מנהל מטבח", role: "department_manager", department_id: DEPT.kitchen });
const floatingLead = makeProfile({ id: "sl-none", full_name: "אחראי בלי מחלקה", role: "shift_manager", department_id: null });
const bartender = makeProfile({ id: "bartender", full_name: "ברמן", role: "employee", department_id: DEPT.bar });
const owner = makeProfile({ id: "owner", full_name: "בעלים", role: "manager", department_id: null });
const office = makeProfile({ id: "office", full_name: "משרד", role: "office_manager", department_id: null });
const inactiveLead = makeProfile({ id: "sl-off", full_name: "אחראי לשעבר", role: "shift_manager", department_id: DEPT.bar, active: false });
const mgmtAssistant = makeProfile({ id: "assistant", full_name: "עוזרת הנהלה", role: "employee", department_id: MGMT });
const everyone = [barShiftLead, kitchenHead, floatingLead, bartender, owner, office, inactiveLead, mgmtAssistant];

const mgmtRow = makeShiftTemplate({ id: "mgr-row", name: "אחמ״ש", department_id: MGMT, shift_key: null, start_time: "19:30", end_time: "01:00" });
const barRow = makeShiftTemplate({ id: "bar-row", name: "בר", department_id: DEPT.bar, shift_key: null, start_time: "18:00", end_time: "02:00" });
const kitchenRow = makeShiftTemplate({ id: "kitchen-row", name: "טבח", department_id: DEPT.kitchen, shift_key: null, start_time: "17:00", end_time: "23:00" });
const templates = [mgmtRow, barRow, kitchenRow];

describe("איזו מחלקה היא מחלקת הנהלה", () => {
  it("הסימון במסד קובע", () => {
    expect(isManagementDepartment({ name: "צוות ניהול", is_management: true })).toBe(true);
    expect(isManagementDepartment({ name: "הנהלה", is_management: false })).toBe(false);
  });

  it("בלי סימון (לפני עדכון המסד) — לפי השם", () => {
    expect(isManagementDepartment({ name: "הנהלה" })).toBe(true);
    expect(isManagementDepartment({ name: "הנהלה בכירה" })).toBe(true);
    expect(isManagementDepartment({ name: "בר" })).toBe(false);
  });
});

describe("מי נחשב צוות הנהלה", () => {
  it("מנהל מחלקה ואחראי משמרת — כן", () => {
    expect(isManagementStaff(barShiftLead)).toBe(true);
    expect(isManagementStaff(kitchenHead)).toBe(true);
  });

  it("עובד, בעלים ומנהלת משרד — לא", () => {
    expect(isManagementStaff(bartender)).toBe(false);
    expect(isManagementStaff(owner)).toBe(false);
    expect(isManagementStaff(office)).toBe(false);
  });
});

describe("מי מופיע בחלון השיבוץ של כל מחלקה", () => {
  it("הנהלה: מנהלי מחלקה ואחראי משמרת מכל המחלקות + העובדים של ההנהלה", () => {
    expect(employeesForSection(everyone, mgmt).map((e) => e.id).sort()).toEqual(
      ["assistant", "dm-kitchen", "sl-bar", "sl-none"].sort(),
    );
  });

  it("הנהלה: עובד רגיל ממחלקה אחרת לא מופיע", () => {
    expect(employeesForSection(everyone, mgmt).some((e) => e.id === "bartender")).toBe(false);
  });

  it("הנהלה: אחראי שהושבת לא מופיע", () => {
    expect(employeesForSection(everyone, mgmt).some((e) => e.id === "sl-off")).toBe(false);
  });

  it("מחלקה רגילה: רק העובדים שלה, כולל האחראי שלה", () => {
    expect(employeesForSection(everyone, barDept).map((e) => e.id).sort()).toEqual(["bartender", "sl-bar"]);
  });

  it("מחלקה רגילה: אחראי ממחלקה אחרת לא מופיע", () => {
    expect(employeesForSection(everyone, kitchenDept).map((e) => e.id)).toEqual(["dm-kitchen"]);
  });

  it("מחלקה בשם 'הנהלה' שהמנהל כיבה לה את הסימון — מתנהגת כרגילה", () => {
    const turnedOff = makeDepartment({ id: MGMT, name: "הנהלה", is_management: false });
    expect(employeesForSection(everyone, turnedOff).map((e) => e.id)).toEqual(["assistant"]);
  });

  it("לפני שהרצת את עדכון המסד — מחלקה בשם 'הנהלה' כבר מציגה את המנהלים", () => {
    const beforePatch = makeDepartment({ id: MGMT, name: "הנהלה" }); // is_management לא קיים
    expect(employeesForSection(everyone, beforePatch).map((e) => e.id).sort()).toEqual(
      ["assistant", "dm-kitchen", "sl-bar", "sl-none"].sort(),
    );
  });

  it("לפני עדכון המסד — מחלקה בשם אחר נשארת רגילה", () => {
    const beforePatch = makeDepartment({ id: DEPT.bar, name: "בר" });
    expect(employeesForSection(everyone, beforePatch).map((e) => e.id).sort()).toEqual(["bartender", "sl-bar"]);
  });
});

describe("על אילו שורות כל אחד מגיש אילוצים", () => {
  it("אחראי משמרת של הבר: שורות הבר + שורות ההנהלה", () => {
    expect(templatesForStaff(templates, barShiftLead, departments).map((t) => t.id).sort()).toEqual(["bar-row", "mgr-row"]);
  });

  it("אחראי משמרת בלי מחלקה: רק שורות ההנהלה", () => {
    expect(templatesForStaff(templates, floatingLead, departments).map((t) => t.id)).toEqual(["mgr-row"]);
  });

  it("עובד רגיל: רק המחלקה שלו", () => {
    expect(templatesForStaff(templates, bartender, departments).map((t) => t.id)).toEqual(["bar-row"]);
  });

  it("עובד בלי מחלקה: כלום", () => {
    expect(templatesForStaff(templates, { ...bartender, department_id: null }, departments)).toEqual([]);
  });

  it("עובד של מחלקת ההנהלה עצמה: שורות ההנהלה, בלי כפילות", () => {
    expect(templatesForStaff(templates, mgmtAssistant, departments).map((t) => t.id)).toEqual(["mgr-row"]);
  });

  it("מחלקת הנהלה מושבתת — לא מוסיפה שורות", () => {
    const off = [{ ...mgmt, active: false }, barDept];
    expect(templatesForStaff(templates, barShiftLead, off).map((t) => t.id)).toEqual(["bar-row"]);
  });

  it("אין מחלקת הנהלה בעסק — רק המחלקה שלו", () => {
    expect(templatesForStaff(templates, barShiftLead, [barDept, kitchenDept]).map((t) => t.id)).toEqual(["bar-row"]);
  });

  it("בלי פרופיל — כלום", () => {
    expect(templatesForStaff(templates, null, departments)).toEqual([]);
  });

  it("שורות כלליות (בלי מחלקה) לא נכנסות לאף אחד", () => {
    const generalRow = makeShiftTemplate({ id: "general", department_id: null, shift_key: null });
    expect(templatesForStaff([generalRow, barRow], barShiftLead, departments).map((t) => t.id)).toEqual(["bar-row"]);
  });

  it("טווחי השעות של אחראי משמרת כוללים את שורת ההנהלה", () => {
    const rows = templatesForStaff(templates, barShiftLead, departments);
    expect(windowsOnDay(rows, 1).map((w) => w.key)).toEqual(["18:00-02:00", "19:30-01:00"]);
  });
});

describe("השיבוץ בשורת ההנהלה מכבד את האילוץ של האחראי", () => {
  it("אחראית הבר סימנה 'יכול' לשעות ההנהלה — עולה ראשונה ברשימה", () => {
    const teamPrefs = buildTeamPrefMap([
      makePreference({ employee_id: "sl-bar", shift_date: MON, start_time: "19:30", end_time: "01:00", preference: "available" }),
      makePreference({ employee_id: "dm-kitchen", shift_date: MON, start_time: "19:30", end_time: "01:00", preference: "cannot" }),
    ]);
    const list = pickerCandidates({
      employees: employeesForSection(everyone, mgmt),
      template: mgmtRow,
      date: MON,
      currentEmployeeId: null,
      assignments: [],
      teamPrefs,
      rowNames: new Map(),
    });
    expect(list[0].employee.id).toBe("sl-bar");
    expect(list[list.length - 1].employee.id).toBe("dm-kitchen");
  });
});

describe("הודעת 'עובדים בלי מחלקה'", () => {
  it("אחראי בלי מחלקה לא נספר כשיש מחלקת הנהלה (הוא מופיע בה)", () => {
    expect(unplacedEmployeeCount([floatingLead, owner, office], departments)).toBe(2);
  });

  it("בלי מחלקת הנהלה — גם האחראי נספר", () => {
    expect(unplacedEmployeeCount([floatingLead, owner, office], [barDept])).toBe(3);
  });

  it("עובדים מושבתים ועובדים עם מחלקה לא נספרים", () => {
    expect(unplacedEmployeeCount([bartender, { ...owner, active: false }], [barDept])).toBe(0);
  });
});
