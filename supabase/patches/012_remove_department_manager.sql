-- ============================================================================
-- 012: איחוד תפקידים — ביטול "מנהל מחלקה" (department_manager)
-- כל מי שהיה מנהל מחלקה הופך ל"אחראי משמרת" (shift_manager), שאחראי על:
-- סידור עבודה, אילוצים, חשבוניות, דוח סגירת קופה וטיפים.
-- ============================================================================

-- העברת כל המשתמשים הקיימים מ-department_manager ל-shift_manager
update public.profiles
set role = 'shift_manager'
where role = 'department_manager';

-- סנכרון role ב-user_metadata (Auth) למשתמשים שהועברו
update auth.users u
set raw_user_meta_data = jsonb_set(
  coalesce(u.raw_user_meta_data, '{}'::jsonb),
  '{role}',
  to_jsonb('shift_manager'::text),
  true
)
from public.profiles p
where p.id = u.id
  and p.role = 'shift_manager'
  and u.raw_user_meta_data->>'role' = 'department_manager';

-- הערה: ערך ה-enum 'department_manager' נשאר קיים ב-DB אך אינו בשימוש יותר
-- (הסרת ערך מ-enum ב-Postgres דורשת בנייה מחדש של הטיפוס ותלויות RLS/פונקציות,
--  ולכן נשאר כ"מת" לא-בשימוש; האפליקציה כבר לא חושפת אותו).
