/**
 * סידור לפי שורות — כל שורה היא עובד אחד, ואילוצים נשמרים לפי טווח שעות.
 * שתי שורות "אירוח ערב" באותן שעות = בחירה אחת לעובד.
 */
import { describe, expect, it } from "vitest";
import { weekWindows, windowKey, windowsOnDay } from "@/lib/shiftTemplateHours";
import { makeShiftTemplate } from "../helpers/factories";

const host1 = makeShiftTemplate({ id: "host-1", name: "אירוח ערב", start_time: "19:30", end_time: "23:30" });
const host2 = makeShiftTemplate({ id: "host-2", name: "אירוח ערב", start_time: "19:30", end_time: "23:30" });
const late = makeShiftTemplate({ id: "late", name: "אירוח ערב", start_time: "20:00", end_time: "00:00" });
const trainee = makeShiftTemplate({ id: "trainee", name: "מתלמד אירוח", start_time: "19:30", end_time: "23:30" });

describe("windowKey", () => {
  it("מתעלם משניות שמגיעות ממסד הנתונים", () => {
    expect(windowKey("19:30:00", "23:30:00")).toBe(windowKey("19:30", "23:30"));
  });
});

describe("windowsOnDay", () => {
  it("שורות כפולות באותן שעות מתאחדות לבחירה אחת", () => {
    const windows = windowsOnDay([host1, host2, late], 0);
    expect(windows.map((w) => w.key)).toEqual(["19:30-23:30", "20:00-00:00"]);
    expect(windows[0].names).toEqual(["אירוח ערב"]);
  });

  it("שמות שונות באותן שעות מוצגות יחד", () => {
    expect(windowsOnDay([host1, trainee], 0)[0].names).toEqual(["אירוח ערב", "מתלמד אירוח"]);
  });

  it("יום שהשורה לא פעילה בו לא מופיע", () => {
    const sundayOnly = { ...host1, days: [{ day_of_week: 0, start_time: "19:30", end_time: "23:30" }] };
    expect(windowsOnDay([sundayOnly], 5)).toEqual([]);
  });
});

describe("weekWindows", () => {
  it("כולל טווח שרץ רק ביום אחד בשבוע", () => {
    const fridayNoon = {
      ...host1,
      id: "fri",
      days: [{ day_of_week: 5, start_time: "12:00", end_time: "18:00" }],
    };
    expect(weekWindows([host1, fridayNoon]).map((w) => w.key)).toEqual(["12:00-18:00", "19:30-23:30"]);
  });
});
