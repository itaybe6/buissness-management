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
      await phone.caption("בלשונית ״אילוצים״ רואים מי יכול ומי לא יכול לעבוד בכל משמרת", 1200);
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
      await phone.tap(page.locator(".attendance-row-hit").first(), { pause: 1400 });
      await phone.tap(page.getByRole("button", { name: /הוצא ממשמרת/ }), { pause: 1500 });
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

  {
    id: "05-shift-report",
    title: "דוח סוף משמרת וחלוקת טיפים",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      const next = page.locator(".rbx-next");
      await phone.goto("/shift-reports");
      phone.markStart();
      await phone.titleCard("דוח סוף משמרת", "סוגרים קופה ומחלקים טיפים בכמה צעדים");
      await phone.caption("ב״דוח משמרת״ רואים את המכירות של כל יום בחודש", 2600);
      await phone.caption("כדי לסגור משמרת לוחצים ״דוח חדש״", 900);
      await phone.tap(page.getByRole("button", { name: "דוח חדש" }), { pause: 1200 });
      await phone.caption("בוחרים את היום ואת אחראי המשמרת", 900);
      await phone.tap(page.getByRole("button", { name: "אתמול" }), { pause: 600 });
      await phone.tap(page.locator(".srw-person").filter({ hasText: "שירה לוי" }), { pause: 600 });
      await phone.tap(next, { pause: 900 });
      await phone.caption("רושמים את סכום המכירות מהקופה", 700);
      await phone.type(page.locator(".srw-money-input").first(), "8740", { delay: 110 });
      await phone.tap(next, { pause: 1000 });
      await phone.caption("הצוות נמשך אוטומטית משעון הנוכחות — אפשר לתקן שעות אם צריך", 3000);
      await phone.tap(next, { pause: 900 });
      await phone.caption("רושמים את סך הטיפים, והמערכת מחלקת אותם לפי השעות", 900);
      await phone.type(page.locator(".srw-money-input").first(), "960", { delay: 120 });
      await phone.wait(1600);
      await phone.scroll(400, 1200);
      await phone.hideCaption();
      await phone.tap(next, { pause: 900 });
      await phone.caption("בסוף מסמנים אם המשימות בוצעו ומוסיפים הערות", 2200);
      await phone.tap(next, { pause: 1400 });
      await phone.caption("בודקים את הסיכום ושומרים — הטיפים נכנסים ישר לשכר", 1200);
      await phone.tap(page.locator(".modal-card .ui-btn").filter({ hasText: "הגש" }), { pause: 1800 });
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: שכר");
    },
  },

  {
    id: "06-payroll",
    title: "שכר חודשי",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/payroll");
      phone.markStart();
      await phone.titleCard("שכר חודשי", "כמה מגיע לכל עובד, מחושב אוטומטית");
      await phone.caption("ב״שכר״ רואים את סך השכר של החודש, מחושב משעון הנוכחות", 2800);
      await phone.hideCaption();
      await phone.scrollTo(page.locator(".pay-cell").first(), 900);
      await phone.caption("לכל עובד — שעות, סוג שכר והסכום לתשלום", 2400);
      await phone.caption("לחיצה על עובד פותחת פירוט מלא", 900);
      await phone.tap(page.locator(".pay-cell").filter({ hasText: "תמר אוחיון" }).first(), { pause: 1600 });
      await phone.caption("משמרת אחרי משמרת: שעות, טיפים והשלמה למינימום", 2600);
      await phone.scroll(600, 1400);
      await phone.hideCaption();
      await page.goBack();
      await phone.wait(1200);
      await phone.scroll(-3000, 600);
      await phone.caption("ובסוף החודש — ״אקסל״ מוריד קובץ מוכן לרואה החשבון", 1200);
      await phone.point(page.getByRole("button", { name: "ייצוא אקסל" }), 1600);
      await phone.caption("ובעיות שכר שעובדים דיווחו מחכות בכפתור ״בעיות שכר״", 1000);
      await phone.tap(page.locator(".pyx-glass-btn").filter({ hasText: "בעיות שכר" }), { pause: 1500 });
      await phone.caption("מעדכנים כל דיווח ל״בטיפול״ או ״טופל״, והעובד רואה את זה אצלו", 3200);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: הזמנת סחורה מספקים");
    },
  },

  {
    id: "07-supplier-order",
    title: "הזמנת סחורה מספקים",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      const addToOrder = page.locator(".modal-card .ui-btn").filter({ hasText: "הוספה להזמנה" });
      await phone.goto("/inventory/order");
      phone.markStart();
      await phone.titleCard("הזמנת סחורה", "מזמינים מהספקים את מה שחסר");
      await phone.caption("במסך ההזמנה המערכת כבר מציעה את המוצרים שנגמרים", 2600);
      await phone.caption("לוחצים על מוצר, והספק והמחיר כבר מוכנים", 900);
      await phone.tap(page.locator(".ordc-reco-card").filter({ hasText: "חלב שיבולת שועל" }), { pause: 1200 });
      await phone.caption("קובעים כמות", 600);
      await phone.tap(page.locator('button[aria-label="הוספת כמות קרטון"]'), { pause: 450 });
      await phone.tap(page.locator('button[aria-label="הוספת כמות קרטון"]'), { pause: 700 });
      await phone.tap(addToOrder, { pause: 1000 });
      await phone.hideCaption();
      await phone.tap(page.locator(".ordc-reco-card").filter({ hasText: "סירופ וניל" }), { pause: 1000 });
      await phone.tap(addToOrder, { pause: 1000 });
      await phone.caption("למטה רואים כמה מוצרים בהזמנה ומה העלות", 2200);
      await phone.tap(page.locator('button.ui-btn:visible:has-text("הבא")'), { pause: 1400 });
      await phone.caption("ההזמנה מחולקת לפי ספק — בודקים ושולחים", 2400);
      await phone.tap(page.locator(".modal-card .ui-btn").filter({ hasText: "שליחה" }), { pause: 1200 });
      await phone.caption("אפשר לשמור אותה כהזמנה קבועה לפעם הבאה, או רק לשלוח", 1200);
      await phone.tap(page.locator(".modal-card .ui-btn").filter({ hasText: "שליחה בלבד" }), { pause: 2000 });
      await phone.caption("כשהסחורה מגיעה, מסמנים שהתקבלה והמלאי מתעדכן לבד", 3000);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: הוספת עובד חדש");
    },
  },

  {
    id: "08-add-employee",
    title: "הוספת עובד חדש",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/users");
      phone.markStart();
      await phone.titleCard("הוספת עובד חדש", "פותחים לעובד משתמש תוך דקה");
      await phone.caption("במסך ״צוות״ רואים את כל העובדים, לפי תפקיד", 2600);
      await phone.caption("לוחצים ״עובד חדש״", 700);
      await phone.tap(page.locator(".srx-cta"), { pause: 1000 });
      await phone.caption("ממלאים שם, אימייל וטלפון", 600);
      await phone.type(page.getByPlaceholder("לדוגמה: דנה כהן"), "רותם שגיא", { delay: 60 });
      await phone.type(page.getByPlaceholder("name@business.co.il"), "rotem@lemon-cafe.demo", { delay: 35 });
      await phone.type(page.getByPlaceholder("050-0000000"), "052-7781234", { delay: 50 });
      await phone.caption("בוחרים הרשאה ואופן תשלום", 700);
      await phone.tap(page.locator(".modal-card button.field").first(), { pause: 600 });
      await phone.tap(page.locator(".select-option").filter({ hasText: /^עובד$/ }).first(), { pause: 700 });
      await phone.scrollTo(page.getByPlaceholder("לפחות 6 תווים"), 700);
      await phone.caption("ומגדירים סיסמה ראשונית שתעבירו לעובד", 600);
      await phone.type(page.getByPlaceholder("לפחות 6 תווים"), "lemon123", { delay: 70 });
      await phone.tap(page.getByRole("button", { name: "יצירת משתמש" }), { pause: 1800 });
      await phone.caption("זהו — העובד יכול להתחבר מהטלפון ולהתחיל לעבוד", 3000);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: מעקב מסמכים וחתימות");
    },
  },

  {
    id: "09-documents",
    title: "מעקב מסמכים וחתימות",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/agreements");
      phone.markStart();
      await phone.titleCard("מסמכים וחתימות", "מי חתם, ומה עוד חסר");
      await phone.caption("ב״מסמכים״ רואים לכל עובד אילו מסמכים חסרים לו", 2800);
      await phone.tap(page.locator(".doc-status-cell-row").filter({ hasText: "ליאור חדד" }).first(), { pause: 1400 });
      await phone.caption("לוחצים על עובד ורואים בדיוק מה הוא כבר חתם", 2400);
      await phone.hideCaption();
      await phone.scroll(-2000, 600);
      await phone.caption("בלשונית ״הסכמים״ רואים כמה מהצוות חתמו על כל מסמך", 1200);
      await phone.tap(page.locator(".docs-tab").filter({ hasText: "הסכמים" }), { pause: 1600 });
      await phone.caption("כאן גם מעלים הסכם חדש — והוא נשלח לחתימה לכל העובדים", 3000);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: טיפול בתקלות");
    },
  },

  {
    id: "10-faults",
    title: "טיפול בתקלות",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/faults");
      phone.markStart();
      await phone.titleCard("טיפול בתקלות", "מהדיווח ועד שהתקלה מטופלת");
      await phone.caption("עובדים מדווחים על תקלות מהטלפון, והן מגיעות לכאן", 2800);
      await phone.caption("לוחצים על תקלה ורואים מי דיווח ומתי", 1000);
      await phone.tap(page.locator(".fault-row__hit").first(), { pause: 1200 });
      await phone.caption("ומעדכנים את הסטטוס בלחיצה", 900);
      await phone.tap(page.locator(".seg-btn").filter({ hasText: "בטיפול" }).first(), { pause: 1600 });
      await phone.caption("התקלה עברה ל״בטיפול״, וכולם רואים שמישהו מטפל בה", 2800);
      await phone.hideCaption();
      await phone.caption("ובסוף — ״טופל״", 600);
      await phone.tap(page.locator(".seg-btn").filter({ hasText: "טופל" }).first(), { pause: 1800 });
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: יצירת אירוע");
    },
  },

  {
    id: "11-events",
    title: "יצירת אירוע",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/events");
      phone.markStart();
      await phone.titleCard("יצירת אירוע", "כל הצוות יודע מה מתוכנן");
      await phone.caption("ב״אירועים״ רואים את האירוע הקרוב ואת כל מה שבהמשך", 2600);
      await phone.caption("לוחצים ״אירוע חדש״", 700);
      await phone.tap(page.locator('button:visible:has-text("אירוע חדש")'), { pause: 1000 });
      await phone.caption("נותנים שם, בוחרים תאריך ומוסיפים פרטים", 700);
      await phone.type(page.getByPlaceholder("לדוגמה: אירוע פרטי לקבוצה"), "יום הולדת 40 — שולחן ארוך במרפסת", { delay: 40 });
      await phone.type(page.locator(".modal-card textarea"), "25 אורחים, תפריט שף קבוע, עוגה מבחוץ.", { delay: 35 });
      await phone.tap(page.locator(".modal-card .ui-btn").filter({ hasText: "שמירה" }), { pause: 1800 });
      await phone.caption("האירוע מופיע לכל הצוות — ואפשר לצרף אליו משימות", 3000);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: הגדרות העסק");
    },
  },

  {
    id: "12-settings",
    title: "הגדרות העסק",
    user: USERS.avi,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/settings");
      phone.markStart();
      await phone.titleCard("הגדרות העסק", "מגדירים פעם אחת, והמערכת עובדת לבד");
      await phone.caption("ב״הגדרות עסק״ כל הגדרה היא כרטיס", 2400);
      await phone.caption("למשל: עד מתי העובדים מגישים זמינות לשבוע הבא", 1000);
      await phone.tap(page.locator(".stx-card").filter({ hasText: "חלון הגשה" }), { pause: 1600 });
      await phone.caption("קובעים יום ושעה, וההגשה נסגרת אוטומטית", 2600);
      await phone.hideCaption();
      await page.keyboard.press("Escape");
      await phone.wait(700);
      await phone.scroll(700, 1200);
      await phone.caption("וגם: מחלקות, משמרות, מחסנים וקטגוריות מוצרים", 3000);
      await phone.scroll(700, 1400);
      await phone.hideCaption();
      await phone.endCard("סיימנו!", "עכשיו אתם יודעים לנהל את העסק מהטלפון");
    },
  },
];
