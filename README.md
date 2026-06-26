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
   > הסכמה כוללת טבלת `shift_templates` דינמית (שעות משמרת לכל עסק), בידוד לפי `business_id`, ו-RLS מלא. הרצה חוזרת מוחקת ובונה מחדש את הטבלאות.
3. **Storage** — צרו Bucket בשם `faults` (לתמונות תקלות) — יחובר בשלב מודול התקלות.

### יצירת סופר אדמין ראשון

ב-**Authentication → Users → Add user**:

- Email + Password לבחירתכם.
- ב-**User Metadata (raw_user_meta_data)** הוסיפו:

```json
{ "full_name": "מנהל מערכת", "role": "super_admin" }
```

טריגר `handle_new_user` ייצור אוטומטית פרופיל מתאים. התחברו עם המשתמש הזה.

### יצירת עסק ומשתמשים

- סופר אדמין יוצר עסקים ומסמן להם מודולים פעילים (בקרוב במסך הפלטפורמה).
- הוספת משתמש לעסק: יצירת משתמש ב-Auth עם `user_metadata` הכולל `full_name`, `role` ו-`business_id` (מזהה העסק).

תפקידים נתמכים: `super_admin`, `manager`, `shift_manager`, `office_manager`, `employee`, `maintenance`.

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
- [ ] שלב 4: אזור סופר אדמין (עסקים + פיצ׳רים + משתמשים)
- [ ] שלב 5: ניהול עובדים + הגדרות עסק + `shift_templates`
- [ ] שלב 6: מודולים 8.1–8.9
- [ ] שלב 7: ליטוש רספונסיבי, RTL ובדיקות
