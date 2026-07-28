# בדיקות למערכת

תיקייה זו מכילה את כל בדיקות היחידה, התרחישים והעומסים של הפרויקט.

## הרצה

```bash
npm test
```

מצב watch (פיתוח):

```bash
npm run test:watch
```

הרצת קבוצה אחת בלבד:

```bash
npx vitest run --config vitest.config.mjs tests/employee
```

הצגת זמני הריצה בבדיקות העומס:

```bash
PERF_LOG=1 npx vitest run --config vitest.config.mjs tests/load
```

## מבנה

```
tests/
  helpers/                  # תשתית משותפת
    factories.ts            # בונים לכל טבלה במסד (עסק, עובד, משמרת, מלאי…)
    perf.ts                 # מדידת זמן + תקציבים לבדיקות עומס
    browserEnv.ts           # localStorage / window מזויפים לריצה ב-node

  employee/                 # ממשק העובד
    navigation.test.ts      # מה יש לו בתפריט ומה חסום
    shiftPreferences.test.ts# הגשת אילוצים: חלון זמן ודרישת מינימום
    attendance.test.ts      # שעון נוכחות, טיימר, חפיפה למשמרת
    dailyChecklist.test.ts  # צ׳ק־ליסט המשימות היומי
    payTracking.test.ts     # מסך «מעקב שכר» — שורות משמרת וסיכומים
    documents.test.ts       # הסכמים, טופס 101, ת״ז
    inventoryCount.test.ts  # ספירת מלאי והמרת יחידות

  office-manager/           # ממשק מנהלת המשרד
    navigation.test.ts      # הרשאות ומה חסום בפניה
    payroll.test.ts         # התאמות חודשיות, ייצוא, עלות מעסיק
    inventoryOrders.test.ts # הזמנות, אצוות, אספקה חלקית, תמחור
    orderSupplierChoice.test.ts # בחירת ספק לכל מוצר ופיצול ההזמנה לספקים
    partialDeliveryAlerts.test.ts # התג האדום על «סחורות»
    warehousesAndCatalog.test.ts  # מחסנים וקטגוריות

  manager/                  # ממשק המנהל
    navigation.test.ts      # התפקיד הרחב ביותר — ומה עדיין חסום בפניו
    team.test.ts            # תפקידים, מחלקות, תנאי שכר והשבתת עובד
    orderReceiving.test.ts  # קבלת סחורה: הגיע הכול, הגיע חלקית, תיקון בדיעבד
    warehouses.test.ts      # מחסנים, מלאי לפי מחסן והעברות ביניהם
    suppliers.test.ts       # מחירונים (ראשי/בודד), שיוך מוצרים, יחידות מידה
    inventoryAudit.test.ts  # יומן המלאי — תצוגת שינויי כמות
    waste.test.ts           # דיווח בלאי, הפחתה מהמלאי וקיבוץ לימים
    faults.test.ts          # תקלות: שיוך, סטטוס ואישור תשלום
    events.test.ts          # אירועים: ספירה לאחור, הרשאות ומשימות אירוע
    documents.test.ts       # סקירת חתימות, טופס 101, שדות PDF וחשבוניות

  super-admin/              # ממשק הסופר אדמין
    businessCreation.test.ts# אשף פתיחת עסק: פרטים, מודולים, מנהל ראשון

  maintenance/              # ממשק איש האחזקה
    navigation.test.ts      # התפריט המצומצם ביותר במערכת
    faults.test.ts          # התראות תקלות וסימון «ראיתי»
    faultPay.test.ts        # תשלום לפי עבודה אחרי אישור מנהל

  manager-to-employee/      # מה שהמנהל עושה → מה שקורה לעובד
    attendanceControl.test.ts # גיאופנס, הוצאה ממשמרת, תיקון שעות
    scheduling.test.ts        # שיבוץ, חוק יום החופש, חלון אילוצים
    payrollControl.test.ts    # סוג שכר, תעריף, אחוז קופה, השבתה
    shiftReportToPay.test.ts  # דוח משמרת → טיפים ובונוס בתלוש
    taskAssignment.test.ts    # הקצאת משימות ואישור מנהל
    accessControl.test.ts     # תפקידים, מודולים, מסמכים, אישור תקלות

  roles/                    # רוחבי
    permissionMatrix.test.ts# מטריצת התפריט המלאה לכל 7 התפקידים
    featureGating.test.ts   # קטלוג המודולים, תלויות ותוכניות מנוי

  load/                     # בדיקות עומס
    payrollScale.test.ts    # 300 עובדים, חודש מלא
    attendanceScale.test.ts # ~9,000 החתמות, צוות של 60
    inventoryScale.test.ts  # 2,000 מוצרים, 12,000 שורות הזמנה
    tasksScale.test.ts      # חצי שנה של היסטוריית משימות

  attendance/ faults/ payroll/ shift-bonuses/ shift-report/ shifts/ tasks/
    # בדיקות היחידה המקוריות של הלוגיקה העסקית
```

## עקרונות

- **בונים במקום העתקות.** כל בדיקה משתמשת ב-`helpers/factories.ts` ודורסת רק
  את השדות שרלוונטיים לה, כדי שהכוונה של הבדיקה תישאר קריאה.
- **בודקים את הקוד האמיתי.** הבדיקות מייבאות מ-`src/` — אין העתק של הלוגיקה
  בתוך הבדיקה. כשצריך היה, הלוגיקה חולצה מקומפוננטה ל-`src/lib` כדי שתהיה
  ניתנת לבדיקה (למשל `attendanceGeofence.ts`, `attendanceSessionEdit.ts`).
- **מקרי קצה הם העיקר.** רשימה ריקה, ערך `null`, משמרת שחוצה חצות, אספקה
  חלקית, localStorage חסום, ותאריכים על הגבול המדויק.
- **תקציבי זמן רחבים.** בדיקות העומס נועדו לתפוס רגרסיה אלגוריתמית (פי 10),
  לא לשמש benchmark — כדי שלא ייכשלו מרעש של מכונה.

## הוספת בדיקות לפיצ'רים חדשים

1. אם הפיצ'ר שייך לתפקיד — הוסיפו לתיקייה שלו.
2. אם הוא פעולה של מנהל שמשפיעה על עובד — `manager-to-employee/`.
3. הוסיפו בונה ב-`helpers/factories.ts` אם נוספו טבלה או שדה חדשים.
4. הריצו `npm test` וגם `npx tsc --noEmit` לפני commit.

## כלים

- [Vitest](https://vitest.dev/) — מנוע הבדיקות
- קונפיגורציה: `vitest.config.mjs`
