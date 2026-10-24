# סרטוני הדרכה (מובייל)

סרטוני הדרכה בעברית, מוקלטים מהאפליקציה האמיתית בגודל של טלפון (390×844, ברזולוציה כפולה),
עם כתוביות וסימון של כל לחיצה.

הנתונים מגיעים מעסק דמו, ״קפה לימון״, שקיים רק בזיכרון בזמן ההקלטה
(`lib/demo-data.mjs`). האפליקציה נבנית מול כתובת Supabase מזויפת, וכל בקשה אליה נענית
מקומית (`lib/postgrest.mjs`). כך שום הקלטה לא נוגעת בפרויקט ה-Supabase האמיתי.
התאריך קבוע: יום שלישי 20.10.2026, 08:52, ולכן כל הקלטה יוצאת זהה.

## הרצה

```bash
npm install
npm run videos            # בונה את האפליקציה ומקליט הכל
node record.mjs employee/02   # רק סרטון אחד (התאמה לפי תחילת המזהה)
```

הסרטונים נשמרים ב-`out/<series>/<id>.mp4`.
אחרי שינוי באפליקציה מריצים שוב `npm run build-app`.

## הוספת סרטון

כל סרטון הוא אובייקט ב-`scenes/*.mjs`, עם `id`, `title`, `user` (משתמש הדמו) ו-`run(phone)`:

- `phone.titleCard / endCard` — מסך פתיחה וסיום
- `phone.caption(text, ms)` — כתובית (עוברת לראש המסך כשנפתח חלון)
- `phone.tap(locator)` — סימון הלחיצה, ואז לחיצה
- `phone.type`, `phone.scroll`, `phone.scrollTo`, `phone.point`, `phone.signature`

כלים לפיתוח: `node probe.mjs noa /shifts` שומר צילום מסך של עמוד,
ו-`node sheet.mjs out/employee/02-clock-in-out.mp4` יוצר דף תמונות ממוזערות לבדיקה מהירה של סרטון.
