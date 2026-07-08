# בדיקות למערכת

תיקייה זו מכילה את כל בדיקות היחידה והתרחישים של הפרויקט.

## הרצה

```bash
npm test
```

מצב watch (פיתוח):

```bash
npm run test:watch
```

## מבנה

```
tests/
  shift-bonuses/          # תוספת שכר מאחוז קופה
    fixtures.ts           # נתוני בדיקה משותפים (עובדים, משמרות, נוכחות)
    computeShiftBonusAmounts.test.ts
    employeeWorkedShift.test.ts
    buildBonusCandidates.test.ts
    filterBonusParticipants.test.ts
    scenarios.test.ts     # תרחישי קצה מקצה לקצה
  payroll/                # שכר: שעתי, טיפים והשלמה למינימום
    fixtures.ts           # עובדים, טיפים, נוכחות
    distributeTips.test.ts    # חלוקת קופת הטיפים לפי שעות
    hourlyWage.test.ts        # שכר שעתי קבוע (שעות × תעריף)
    tipsMinimumTopup.test.ts  # השלמה למינימום לכל משמרת בנפרד
    scenarios.test.ts         # תרחישי שכר מקצה לקצה
```

## פיצ'ר: תוספת שכר מאחוז קופה

הבדיקות מכסות:

| קובץ | מה נבדק |
|------|---------|
| `computeShiftBonusAmounts` | חישוב קופה, אחוזים, חלוקה שווה, עיגול |
| `employeeWorkedShift` | שיבוץ + נוכחות + חפיפה עם שעות המשמרת |
| `buildBonusCandidatesFromShift` | רשימת עובדים זכאים בממשק המנהל |
| `filterBonusParticipantsToWorkedShift` | סינון שרת לפני שמירה |
| `scenarios` | תרחישים עסקיים: 5 עובדים, עקיפות, משמרת בוקר/ערב, שמירה חוזרת |

## פיצ'ר: שכר וטיפים

הבדיקות מכסות:

| קובץ | מה נבדק |
|------|---------|
| `distributeTips` | חלוקת קופת הטיפים בין המשתתפים לפי שעות עבודה, עיגול לאגורות, קצוות |
| `hourlyWage` | עובד שעתי — שעות × תעריף, סיכום נוכחות, התעלמות מהחתמה פתוחה |
| `tipsMinimumTopup` | השלמה למינימום — רצפת שכר לכל משמרת בנפרד (משמרת חזקה לא מכסה חלשה) |
| `scenarios` | מקצה לקצה: משמרת אחת, צוות מעורב (שעתי + טיפים), חודש שלם |

הלוגיקה נבדקת מול הקוד האמיתי דרך `src/lib/shiftReportTips.ts` (חלוקת טיפים)
ו-`src/lib/payrollCompute.ts` (חישוב השכר וההשלמה) — אותן פונקציות שבהן משתמשים
`ShiftReports` ו-`Payroll` בפועל.

## הוספת בדיקות לפיצ'רים חדשים

1. צור תת-תיקייה תחת `tests/<feature-name>/`
2. הוסף `fixtures.ts` לנתוני בדיקה
3. הוסף קבצי `*.test.ts`
4. הרץ `npm test` לפני commit

## כלים

- [Vitest](https://vitest.dev/) — מנוע הבדיקות
- קונפיגורציה: `vitest.config.mjs`
