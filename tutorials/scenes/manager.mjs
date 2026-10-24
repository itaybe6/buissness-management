// Management series: running the café from a phone, as אבי (the owner).

import { USERS } from "../lib/demo-data.mjs";

const btn = (page, name) => page.getByRole("button", { name });

export const managerScenes = [
  {
    id: "01-dashboard",
    title: "הדשבורד — תמונת מצב של העסק",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/dashboard");
      phone.markStart();
      await phone.titleCard("הדשבורד", "כל מה שקורה בעסק, במבט אחד");
      await phone.caption("בכניסה למערכת רואים מי במשמרת עכשיו ואת הכנסות החודש", 3000);
      await phone.hideCaption();
      await phone.scrollTo(page.getByText("עלויות שכר").first(), 900);
      await phone.caption("כאן רואים כמה עולה השכר — לפי שבוע או לפי חודש", 2400);
      await phone.tap(page.getByRole("tab", { name: "חודש" }), { pause: 1600 });
      await phone.tap(page.getByRole("tab", { name: "שבוע" }), { pause: 600 });
      await phone.hideCaption();
      await phone.scroll(900, 1100);
      await phone.caption("כרטיסים מהירים: טיפים, משימות פתוחות, מלאי נמוך ותקלות", 3000);
      await phone.caption("לחיצה על כרטיס מעבירה ישר למסך המתאים", 2200);
      await phone.hideCaption();
      await phone.scrollTo(page.getByText("הצוות כעת").first(), 1200);
      await phone.caption("ובתחתית — מי נמצא עכשיו במשמרת ומאיזו שעה", 3000);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: בניית סידור עבודה");
    },
  },

  {
    id: "02-build-schedule",
    title: "בניית סידור עבודה",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/shifts");
      await phone.wait(800);
      phone.markStart();
      await phone.titleCard("בניית סידור עבודה", "משבצים עובדים למשמרות מהטלפון");
      await phone.caption("במסך ״משמרות״ רואים את הסידור של כל יום, לפי מחלקות", 2800);
      await phone.hideCaption();
      await phone.caption("עוברים בין הימים בפס העליון", 900);
      await phone.tap(page.locator(".shift-day-pill").nth(4), { pause: 1400 });
      await phone.caption("כדי לשבץ, לוחצים ״שיבוץ עובד״ במשמרת הרצויה", 1200);
      await phone.tap(page.locator(".shift-mobile-add").first(), { pause: 1200 });
      await phone.caption("ליד כל עובד רואים אם כבר שובץ, ובכמה ימים הוא עובד השבוע", 2800);
      await phone.tap(page.locator(".shift-picker-item:not([disabled])").first(), { pause: 1400 });
      await phone.caption("העובד שובץ, והמשמרת תופיע אצלו בטלפון", 2800);
      await phone.hideCaption();
      await phone.scroll(-2000, 700);
      await phone.caption("בלשונית ״אילוצים״ רואים את הזמינות שהעובדים הגישו לשבוע הבא", 1200);
      await phone.tap(page.getByRole("tab", { name: /אילוצים/ }), { pause: 2400 });
      await phone.scroll(500, 1600);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: שעון נוכחות");
    },
  },

  {
    id: "03-attendance",
    title: "שעון נוכחות ותיקון שעות",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/attendance");
      phone.markStart();
      await phone.titleCard("שעון נוכחות", "מי במשמרת, ואיך מתקנים שעות");
      await phone.caption("״שעון נוכחות״ מראה מי במשמרת עכשיו, לפי מחלקות", 2800);
      await phone.hideCaption();
      await phone.scrollTo(page.locator(".attendance-row-edit").first(), 900);
      await phone.caption("עובד שכח להחתים? לוחצים על העיפרון ומתקנים את השעה", 1200);
      await phone.tap(page.locator(".attendance-row-edit").first(), { pause: 1400 });
      await phone.caption("משנים את שעת הכניסה או היציאה ושומרים", 2800);
      await phone.hideCaption();
      await page.keyboard.press("Escape");
      await phone.wait(700);
      await phone.caption("ועובד שנשכח במשמרת? ״הוצאה״ מחתים לו יציאה", 1200);
      await phone.tap(page.locator(".attendance-row-hit").first(), { pause: 1600 });
      await phone.caption("כל השינויים נכנסים אוטומטית לחישוב השכר", 2800);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: משימות לצוות");
    },
  },

  {
    id: "04-tasks",
    title: "משימות לצוות",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/tasks");
      phone.markStart();
      await phone.titleCard("משימות לצוות", "מעקב ביצוע, משימה חד-פעמית ומשימה קבועה");
      await phone.caption("ב״מעקב ביצוע״ רואים מה כל מחלקה כבר עשתה היום", 2800);
      await phone.hideCaption();
      await phone.caption("כדי לתת משימה לעובד מסוים — ״משימות חד-פעמיות״", 1000);
      await phone.tap(page.locator(".tasks-mgr-tab-btn").filter({ hasText: "חד-פעמיות" }), { pause: 1400 });
      await phone.tap(page.locator(".ftp-add-btn"), { pause: 1000 });
      await phone.caption("כותבים מה צריך לעשות", 600);
      await phone.type(page.getByPlaceholder("לדוגמה: הכנת אירוע פרטי"), "לנקות את מסנני המזגן", { delay: 55 });
      await phone.caption("בוחרים למי המשימה", 800);
      await phone.tap(page.locator(".modal-card button.field").filter({ hasText: "לא משויך" }), { pause: 800 });
      await phone.tap(page.locator(".select-option").filter({ hasText: "דניאל פרץ" }).first(), { pause: 700 });
      await phone.caption("ואפשר להוסיף הסבר", 600);
      await phone.type(page.locator(".modal-card textarea"), "במטבח ובבר. לשטוף במים ולייבש לפני ההחזרה.", { delay: 35 });
      await phone.tap(page.getByRole("button", { name: /הוספת משימה/ }), { pause: 1400 });
      await phone.caption("דניאל יראה את המשימה ישר במסך הבית שלו", 2600);
      await phone.hideCaption();
      await phone.caption("ומשימות שחוזרות כל יום? ״משימות קבועות״, לפי מחלקה", 1200);
      await phone.tap(page.locator(".tasks-mgr-tab-btn").filter({ hasText: "קבועות" }), { pause: 2400 });
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: דוח סוף משמרת");
    },
  },
];
