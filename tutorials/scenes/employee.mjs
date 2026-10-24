// Employee series: the day-to-day of a worker on their phone. Every scene
// follows נועה (a waitress at the demo café) on Tuesday morning.

import { USERS } from "../lib/demo-data.mjs";

const btn = (page, name) => page.getByRole("button", { name, exact: false });

export const employeeScenes = [
  {
    id: "01-login-and-home",
    title: "כניסה לאפליקציה ומסך הבית",
    user: null,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/login");
      phone.markStart();
      await phone.titleCard("כניסה לאפליקציה", "איך מתחברים ומה יש במסך הבית");
      await phone.caption("מתחברים עם האימייל והסיסמה שקיבלתם מהמנהל", 1200);
      await phone.type("#auth-email", "noa@lemon-cafe.demo", { delay: 45 });
      await phone.type("#auth-password", "lemon2026", { delay: 60 });
      await phone.tap(page.locator('button[type="submit"]'), { pause: 2200 });

      await phone.caption("זה מסך הבית — מכאן מתחילים כל משמרת", 2400);
      await phone.point(page.locator(".worker-hero-punch"), 400);
      await phone.caption("הכפתור הגדול משמש להחתמת כניסה ויציאה", 2400);
      await phone.hideCaption();
      await phone.scrollTo(page.locator(".worker-home__tabs"));
      await phone.caption("למטה יש את המשימות שלך להיום", 2600);
      await phone.tap(page.getByRole("tab", { name: /הצוות/ }));
      await phone.caption("ובלשונית ״הצוות״ רואים מי כבר נמצא במשמרת", 2600);
      await phone.tap(page.getByRole("tab", { name: /משימות/ }), { pause: 400 });

      await phone.hideCaption();
      await phone.scroll(-3000, 900);
      await phone.caption("כל שאר המסכים נמצאים בתפריט", 1200);
      await phone.tap(btn(page, "פתח תפריט"), { pause: 900 });
      await phone.caption("משמרות, מעקב שכר, מוצרים, מסמכים ועוד", 3200);
      await phone.hideCaption();
      await phone.tap(page.locator('aside[aria-label="תפריט ניווט"]').getByRole("button", { name: "סגור", exact: true }), { pause: 600 });
      await phone.endCard("זהו, אפשר להתחיל", "בסרטון הבא: החתמת כניסה ויציאה ממשמרת");
    },
  },

  {
    id: "02-clock-in-out",
    title: "החתמת כניסה ויציאה ממשמרת",
    user: USERS.noa,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/dashboard");
      phone.markStart();
      await phone.titleCard("החתמת כניסה ויציאה", "איך מתחילים ומסיימים משמרת");
      await phone.caption("הגעת לעבודה? לוחצים על השעון הגדול במסך הבית", 1500);
      await phone.tap(btn(page, "החתמת כניסה"), { pause: 900 });
      await phone.caption("מי שעובד/ת ביותר מתפקיד אחד בוחר/ת באיזה תפקיד נכנסים היום", 2600);
      await phone.tap(page.locator(".modal-card button").filter({ hasText: "שירות" }), { pause: 1200 });
      await phone.caption("הכניסה נרשמה, והשעון סופר את זמן המשמרת", 3200);

      await phone.hideCaption();
      // Jump to the end of the shift.
      await page.clock.fastForward("07:58:00");
      await phone.wait(600);
      await phone.caption("בסוף המשמרת לוחצים שוב על אותו כפתור", 1600);
      await phone.tap(btn(page, "החתמת יציאה"), { pause: 900 });
      await phone.caption("אם נשארו משימות פתוחות תקבלו תזכורת לפני היציאה", 3000);
      await phone.caption("אפשר לחזור ולסיים אותן, או לצאת בכל זאת", 2200);
      await phone.tap(btn(page, "צא בכל זאת"), { pause: 1200 });
      await phone.caption("היציאה נרשמה, והשעות נכנסות אוטומטית למעקב השכר", 3200);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: סימון משימות במשמרת");
    },
  },

  {
    id: "03-daily-tasks",
    title: "המשימות שלי במשמרת",
    user: USERS.noa,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/dashboard");
      phone.markStart();
      await phone.titleCard("המשימות שלי", "איך רואים ומסמנים משימות במשמרת");
      await phone.scrollTo(page.locator(".worker-home__tabs"), 1000);
      await phone.caption("במסך הבית מופיעות המשימות שלך להיום", 2400);
      await phone.caption("חלקן קבועות לכל המחלקה, וחלקן נשלחו אלייך אישית", 2600);

      const card = (text) => page.locator(".task-row-card").filter({ hasText: text });
      const sign = card("להכין שלט גיר");
      await phone.scrollTo(sign, 800);
      await phone.caption("לוחצים על המשימה כדי לראות פרטים", 1200);
      await phone.tap(sign.getByRole("button", { name: "פתיחת פרטי משימה" }).last(), { pause: 700 });
      await phone.scrollTo(sign, 900);
      await phone.caption("כאן רואים את ההסבר, ואפשר גם לצרף תמונה כתיעוד", 3000);
      await phone.caption("סיימת? מסמנים את המשימה כבוצעה", 1400);
      await phone.tap(sign.getByRole("button", { name: "סמן כבוצע" }).first(), { pause: 1600 });
      await phone.caption("המשימה מסומנת, והמנהל רואה שהיא בוצעה", 2800);
      await phone.hideCaption();

      const porch = card("פתיחת מרפסת וסידור שולחנות");
      await phone.scrollTo(porch, 700);
      await phone.tap(porch.getByRole("button", { name: "סמן כבוצע" }).first(), { pause: 1400 });
      await phone.caption("אפשר לראות גם משימות של ימים אחרים בשבוע", 1200);
      await phone.scrollTo(page.locator(".worker-home__tabs"), 700);
      await phone.tap(page.getByRole("button", { name: /^ד׳|21/ }).first(), { pause: 1800 });
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: הגשת זמינות למשמרות");
    },
  },

  {
    id: "04-availability",
    title: "הגשת זמינות למשמרות",
    user: USERS.noa,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/shifts");
      await phone.wait(600);
      phone.markStart();
      await phone.titleCard("הגשת זמינות", "איך מסמנים באילו משמרות אפשר לעבוד בשבוע הבא");
      await phone.caption("במסך ״משמרות״ מגישים זמינות לשבוע הבא", 2400);
      await phone.point(page.getByText("ניתן לעדכן עד"), 300);
      await phone.caption("כאן רואים עד מתי אפשר להגיש, וכמה ימים צריך לסמן", 2800);
      await phone.hideCaption();

      const days = page.locator(".shift-day-strip-days button");
      const card = (name) => page.locator(".prefs2-card").filter({ hasText: name });
      await phone.scrollTo(days.first(), 700);
      await phone.caption("בוחרים יום, ולכל משמרת מסמנים ״יכול״ או ״לא יכול״", 1600);
      await phone.tap(card("בוקר").locator('.pref-seg-btn[data-kind="yes"]'), { pause: 700 });
      await phone.tap(card("ערב").locator('.pref-seg-btn[data-kind="no"]'), { pause: 900 });
      await phone.caption("הסימון נשמר אוטומטית — אין צורך ללחוץ ״שמור״", 2600);

      await phone.caption("עוברים ליום הבא", 900);
      await phone.tap(days.nth(1), { pause: 700 });
      await phone.caption("יכולים לעבוד כל היום? ״סמן הכל — יכול״ מסמן את כל המשמרות", 1400);
      await phone.tap(page.getByRole("button", { name: /סמן הכל/ }), { pause: 1600 });

      await phone.hideCaption();
      for (const i of [3, 5]) {
        await phone.tap(days.nth(i), { pause: 500 });
        await phone.tap(page.getByRole("button", { name: /סמן הכל/ }), { pause: 700 });
      }
      await phone.scroll(-2000, 900);
      await phone.caption("ההתקדמות מתעדכנת, והמנהל רואה את הזמינות שלך כשהוא בונה סידור", 3200);
      await phone.hideCaption();

      await phone.caption("ואחרי שהסידור מתפרסם — המשמרות שלך מופיעות ב״השיבוצים שלי״", 1400);
      await phone.tap(page.getByText("השיבוצים שלי"), { pause: 1200 });
      await phone.scrollTo(page.getByText("השיבוצים שלי"), 900);
      await phone.scroll(260, 1400);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: מעקב שכר");
    },
  },

  {
    id: "05-pay-tracking",
    title: "מעקב שכר",
    user: USERS.noa,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/my-shifts");
      phone.markStart();
      await phone.titleCard("מעקב שכר", "כמה עבדת וכמה הרווחת החודש");
      await phone.caption("ב״מעקב שכר״ רואים את סך ההכנסה של החודש", 2600);
      await phone.caption("כמה משמרות, כמה שעות, וכמה טיפים", 2600);
      await phone.hideCaption();
      await phone.scroll(420, 1000);
      await phone.caption("ומתחת — כל משמרת בנפרד", 1400);
      await phone.tap(page.getByRole("button", { name: /פרטי משמרת/ }).first(), { pause: 1600 });
      await phone.caption("בלחיצה על משמרת רואים בדיוק איך חושב השכר שלה", 3000);
      await phone.hideCaption();
      await page.keyboard.press("Escape");
      await phone.wait(500);
      const close = page.locator(".modal-card").getByRole("button", { name: /סגירה|סגור/ });
      if (await close.count()) await phone.tap(close.first(), { pause: 400 });
      await phone.scroll(-3000, 900);
      await phone.caption("עובדים ביותר מתפקיד? אפשר לסנן לפי תפקיד", 1200);
      await phone.tap(page.getByRole("tab", { name: /בר/ }), { pause: 1400 });
      await phone.tap(page.getByRole("tab", { name: /הכל/ }), { pause: 600 });
      await phone.caption("ובחצים מחליפים חודש", 1000);
      await phone.tap(page.getByRole("button", { name: "חודש קודם" }), { pause: 1800 });
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: דיווח על בעיה בשכר");
    },
  },

  {
    id: "06-salary-issue",
    title: "דיווח על בעיה בשכר",
    user: USERS.noa,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/salary-issues");
      phone.markStart();
      await phone.titleCard("דיווח על בעיה בשכר", "משהו לא מסתדר בתלוש? מדווחים מהטלפון");
      await phone.caption("במסך ״בעיות שכר״ רואים את כל הדיווחים שלך ואת הסטטוס שלהם", 2800);
      await phone.caption("כדי לפתוח דיווח חדש לוחצים על ״דיווח בעיה״", 1300);
      await phone.tap(page.getByRole("button", { name: /דיווח בעיה/ }).last(), { pause: 900 });
      await phone.caption("בוחרים את סוג הבעיה", 1200);
      await phone.tap(page.locator(".siq-tile").filter({ hasText: "טיפים" }).last(), { pause: 900 });
      await phone.caption("ומתארים מה קרה — תאריך, משמרת וסכום עוזרים לטפל מהר", 900);
      await phone.type(page.locator("textarea").last(), "במשמרת ערב ב־13/10 קיבלתי 605 ₪ טיפים, ונראה לי שחסרה שעה בחישוב.", { delay: 35 });
      await phone.wait(600);
      await phone.tap(page.getByRole("button", { name: "שליחת הדיווח" }).last(), { pause: 1600 });
      await phone.caption("הדיווח נשלח למנהלת המשרד, ותראו כאן מתי הוא בטיפול ומתי טופל", 3400);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: עדכון כמויות במלאי");
    },
  },

  {
    id: "07-inventory-count",
    title: "עדכון כמות של מוצר",
    user: USERS.noa,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/inventory");
      phone.markStart();
      await phone.titleCard("עדכון מלאי", "איך מעדכנים כמה נשאר ממוצר");
      await phone.caption("במסך ״מוצרים״ רואים את כל המלאי של העסק", 2400);
      await phone.point(page.getByText("מלאי נמוך").first(), 300);
      await phone.caption("מוצר שנגמר או שעומד להיגמר מסומן ב״מלאי נמוך״", 2600);
      await phone.hideCaption();
      await phone.caption("מחפשים את המוצר לפי שם", 600);
      await phone.type(page.getByPlaceholder(/חיפוש/), "חלב", { delay: 110 });
      await phone.wait(700);
      await phone.caption("ולוחצים עליו", 600);
      await phone.tap(page.locator(".invs-card-body").filter({ hasText: "חלב שיבולת שועל" }), { pause: 1200 });
      await phone.caption("כאן רואים כמה יש בכל מחסן", 2200);
      await phone.caption("לוחצים ״עריכה״ ומעדכנים לפי מה שספרתם", 1000);
      const modal = page.locator(".modal-card");
      await phone.tap(modal.getByRole("button", { name: /עריכה/ }), { pause: 700 });
      const plus = modal.locator('button[aria-label^="הוספת"]').first();
      await phone.tap(plus, { pause: 450 });
      await phone.tap(plus, { pause: 450 });
      await phone.tap(plus, { pause: 700 });
      await phone.tap(modal.getByRole("button", { name: /שמור/ }), { pause: 1400 });
      await phone.caption("הכמות עודכנה, ונשמר מי עדכן ומתי", 3000);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: חתימה על מסמכים");
    },
  },

  {
    id: "08-sign-documents",
    title: "חתימה על מסמכים",
    user: USERS.noa,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/agreements");
      phone.markStart();
      await phone.titleCard("חתימה על מסמכים", "חותמים על מסמכי העבודה ישר מהטלפון");
      await phone.caption("במסך ״מסמכים״ מופיע כל מה שמחכה לחתימה שלך", 2800);
      await phone.caption("לוחצים על המסמך כדי לקרוא אותו", 1100);
      await phone.tap(page.getByText("תקנון מניעת הטרדה מינית").first(), { pause: 1400 });
      await phone.caption("קוראים את המסמך עד הסוף", 2400);
      await phone.caption("ולוחצים ״אני מאשר/ת וחותם/ת״", 1000);
      await phone.tap(page.getByRole("button", { name: /מאשר\/ת וחותם\/ת/ }), { pause: 900 });
      await phone.caption("חותמים עם האצבע בתוך התיבה", 600);
      await phone.signature(page.locator(".modal-card canvas"));
      await phone.tap(page.getByRole("button", { name: "אישור החתימה" }), { pause: 1600 });
      await phone.caption("המסמך נחתם ועובר לרשימת ״הושלמו״", 3000);
      await phone.hideCaption();
      await phone.endCard("זהו!", "בסרטון הבא: אירועים קרובים");
    },
  },

  {
    id: "09-events",
    title: "אירועים קרובים",
    user: USERS.noa,
    async run(phone) {
      const { page } = phone;
      await phone.goto("/events");
      phone.markStart();
      await phone.titleCard("אירועים", "מה קורה בעסק בימים הקרובים");
      await phone.caption("במסך ״אירועים״ רואים את האירוע הבא ואת הזמן שנשאר עד אליו", 3000);
      await phone.scroll(500, 900);
      await phone.caption("ומתחת — כל שאר האירועים הקרובים", 2200);
      await phone.caption("לוחצים על אירוע כדי לראות את כל הפרטים", 1000);
      await phone.tap(page.getByText("ערב ג׳אז חי").first(), { pause: 1600 });
      await phone.scroll(300, 1200);
      await phone.hideCaption();
      await phone.endCard("סיימנו!", "עכשיו אתם יודעים להשתמש באפליקציה");
    },
  },
];
