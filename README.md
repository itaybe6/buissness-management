# אופק — מערכת ניהול עסקים (Multi-Tenant SaaS)

פלטפורמה אחת בעברית מלאה (RTL) לניהול מסעדות, ברים ועסקי שירות. כל עסק רואה ועובד רק על הנתונים שלו (Multi-Tenant עם Supabase RLS), והתפריט נבנה דינמית לפי התפקיד ולפי המודולים שהופעלו לעסק.

## סטאק טכנולוגי

- **Vite + React 18 + TypeScript** (SPA)
- **Tailwind CSS** עם מערכת עיצוב (Design System) ו-RTL מלא + מצב בהיר/כהה
- **Supabase** — Auth (מייל+סיסמה), Postgres + RLS, Storage
- **React Router** לניווט, **React Query** לניהול נתונים

> הערה: נבחר Vite (במקום Next.js) כי המערכת היא SPA מבוסס-תפקיד, וזהו המסלול המהיר והיציב ביותר עבור סביבת ההרצה. האבטחה האמיתית נאכפת ב-DB (RLS), והגנת הנתיבים נעשית בצד הלקוח.

## התקנה והרצה

```bash
npm install
npm run dev
```

האפליקציה תעלה בכתובת http://localhost:5173

> חשוב (Windows/OneDrive): הסקריפטים מריצים את Vite עם `--config vite.config.mjs` במפורש, כי גילוי-קונפיג אוטומטי של Vite נכשל בנתיבי OneDrive עם רווחים/עברית. אל תסירו את הדגל הזה.

## משתני סביבה (`.env`)

הקובץ `.env` כבר קיים עם:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` הוא **לשרת בלבד** (Edge Function) ואסור שייכלל בבאנדל של הדפדפן. ראו `.env.example`.

## הקמת מסד הנתונים (חד-פעמי)

1. בלוח הבקרה של Supabase: **Authentication → Providers** — ודאו ש-Email מופעל.
2. **SQL Editor → New query** — הדביקו והריצו את כל התוכן של `supabase/schema.sql`.
   > הסכמה כוללת טבלת `departments` (מחלקות: מטבח/בר/מלצרות...), תפקיד `department_manager`, טבלת `shift_templates` דינמית (שעות משמרת לכל עסק), בידוד לפי `business_id`, ו-RLS מלא. הרצה חוזרת מוחקת ובונה מחדש את הטבלאות.
3. **Storage (מודול תקלות)** — הריצו את `supabase/storage.sql` ב-SQL Editor (יוצר Bucket בשם `faults` עם הרשאות העלאה/צפייה). לחלופין: **Storage → New bucket → name: `faults`, Public: on**.
4. **פונקציית יצירת משתמשים (Edge Function)** — נדרשת כדי שסופר אדמין/מנהל יוכלו ליצור עובדים מתוך הממשק:

```bash
# מתוך תיקיית הפרויקט, עם Supabase CLI מותקן ומחובר (supabase login)
supabase functions deploy create-user
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

> ללא פריסת הפונקציה, אפשר עדיין ליצור משתמשים ידנית דרך **Authentication → Users → Add user** (ראו למטה). הממשק יציג הודעה מתאימה אם הפונקציה לא פרוסה.

### יצירת סופר אדמין ראשון

ב-**Authentication → Users → Add user**:

- Email + Password לבחירתכם.
- ב-**User Metadata (raw_user_meta_data)** הוסיפו:

```json
{ "full_name": "מנהל מערכת", "role": "super_admin" }
```

טריגר `handle_new_user` ייצור אוטומטית פרופיל מתאים. התחברו עם המשתמש הזה.

### יצירת עסק ומשתמשים

- סופר אדמין יוצר עסקים ומסמן להם מודולים פעילים ישירות במסך **עסקים**.
- הוספת משתמש מתבצעת מהממשק (כפתור "הוספת משתמש") — מצריך את פונקציית `create-user` (ראו למעלה).
- לחלופין ידנית ב-Auth: צרו משתמש עם `user_metadata` הכולל `full_name`, `role`, `business_id`, ואופציונלית `department_id`, `phone`, `hourly_rate`.

תפקידים נתמכים: `super_admin`, `manager`, `department_manager` (מנהל מחלקה — בונה את סידור העבודה ורואה את כל המחלקות), `shift_manager`, `office_manager`, `employee`, `maintenance`.

### מחלקות וסידור עבודה

- במסך **הגדרות עסק** המנהל מגדיר **מחלקות** (מטבח, בר, מלצרות, אירוח...) ו**שעות משמרת**.
- כל עובד משויך למחלקה במסך **משתמשים**.
- עובד מגיש **אילוצים** שבועיים (מעדיף / יכול / לא יכול) לכל משמרת.
- מנהל/מנהל מחלקה/מנהל משמרת בונים **סידור עבודה לכל מחלקה בנפרד**, רואים את אילוצי העובדים תוך כדי שיבוץ, ויכולים לראות את כל הסידורים.

## מודולים זמינים

הסכמים (חתימה דיגיטלית), טופס 101, אילוצים + סידור עבודה לפי מחלקות, שעון נוכחות (Geofence), שכר + טיפים, סחורות ומלאי, דיווח תקלות עם צילום, אירועים, משימות (חד-פעמיות + קבועות). כל מודול ניתן להפעלה/כיבוי לכל עסק בנפרד.

## מבנה הפרויקט

```
src/
  components/
    layout/AppShell.tsx     # סרגל צד דינמי + טופבר + ניווט מובייל
    ui/                     # Design System: Button, Input, Card, Badge, Modal, ...
    ProtectedRoute.tsx      # הגנת נתיבים
  lib/
    supabase.ts             # חיבור Supabase
    auth.tsx                # session, profile, business features
    theme.tsx               # מצב בהיר/כהה
    constants.ts            # תפקידים, מודולים, הגדרת תפריט דינמי
  pages/                    # מסכים
  types/database.ts         # טייפים לכל ישות במסד
supabase/schema.sql         # סכמה מלאה (להריץ ב-Supabase)
```

## סטטוס פיתוח

- [x] שלב 1: הקמה + Supabase + Auth + הגנת נתיבים
- [x] שלב 2: Design System
- [x] שלב 3: Layout + תפריט דינמי לפי תפקיד/מודולים
- [x] שלב 4: אזור סופר אדמין (עסקים + פיצ׳רים + משתמשים גלובליים)
- [x] שלב 5: ניהול עובדים + הגדרות עסק (מחלקות + `shift_templates` + מיקום)
- [x] שלב 6: כל המודולים (הסכמים, טופס 101, סידור עבודה, נוכחות, שכר, מלאי, תקלות, אירועים, משימות)
- [x] שלב 7: ליטוש רספונסיבי, RTL, מצבי טעינה/שגיאה/ריק
