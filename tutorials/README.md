# סרטוני הדרכה (מובייל)

סרטוני הדרכה בעברית, מוקלטים מהאפליקציה האמיתית בגודל של טלפון (390×844, ברזולוציה כפולה),
עם כתוביות, סימון של כל לחיצה ומוזיקת רקע מקורית (מסונתזת בקוד, בלי זכויות יוצרים).
הם מוצגים באפליקציה בעמוד **סרטוני הדרכה** (`/tutorials`), עם לשוניות "עובדים" ו"הנהלה".

הנתונים מגיעים מעסק דמו, ״קפה לימון״, שקיים רק בזיכרון בזמן ההקלטה
(`lib/demo-data.mjs`). האפליקציה נבנית מול כתובת Supabase מזויפת, וכל בקשה אליה נענית
מקומית (`lib/postgrest.mjs`). כך שום הקלטה לא נוגעת בפרויקט ה-Supabase האמיתי.
התאריך קבוע: יום שלישי 20.10.2026, 08:52, ולכן כל הקלטה יוצאת זהה.

## הרצה

```bash
npm install
npx playwright install chromium-headless-shell
npm run videos                 # בונה, מקליט הכל ומפרסם לאפליקציה
node record.mjs manager/05     # רק סרטון אחד (התאמה לפי תחילת המזהה)
node publish.mjs               # מעתיק ל-public/tutorials ומעדכן את manifest.json
```

הסרטונים נשמרים קודם ב-`out/<series>/<id>.mp4`, ו-`publish.mjs` מעתיק אותם לאפליקציה
יחד עם תמונה ממוזערת. אחרי שינוי באפליקציה מריצים שוב `npm run build-app`.

ההקלטה חייבת לרוץ על Chromium מסוג headless-shell עם `--force-device-scale-factor=2`.
Chrome מלא מצלם את חלון הדפדפן במקום את מסך הטלפון, והסרטון יוצא מתוח עם פס לבן.
ההקלטה נעצרת אוטומטית אם פריים לא בגודל הנכון.

## הוספת סרטון

כל סרטון הוא אובייקט ב-`scenes/employee.mjs` או `scenes/manager.mjs`, עם `id`, `title`, `user` ו-`run(phone)`:

- `phone.titleCard / endCard`: מסך פתיחה וסיום
- `phone.caption(text, ms)`: כתובית. כשנפתח חלון היא עוברת לראש המסך
- `phone.tap(locator)`: מסמן את הלחיצה ואז לוחץ
- `phone.type`, `phone.scroll`, `phone.scrollTo`, `phone.point`, `phone.signature`

## כלים לפיתוח

- `node probe.mjs avi --ui /shifts`: צילום מסך של עמוד ורשימת הכפתורים והשדות שבו
- `node explore.mjs avi /users 'click:.srx-cta' 'dump'`: מריץ כמה צעדים ומציג את המסך אחרי כל אחד
- `node sheet.mjs out/manager/02-build-schedule.mp4`: דף תמונות ממוזערות לבדיקה מהירה של סרטון
- כשסרטון נכשל, `shots/fail-<id>.png` ו-`shots/fail-<id>.txt` מראים מה היה על המסך
