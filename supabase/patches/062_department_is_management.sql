-- מחלקת הנהלה: בסידור של מחלקה כזו משבצים גם מנהלי מחלקה ואחראי משמרת
-- מכל העסק (הם שייכים בדרך כלל למחלקה אחרת), ואחראי משמרת מגישים
-- אילוצים גם לשורות שלה.

alter table public.departments
  add column if not exists is_management boolean not null default false;

-- מחלקות קיימות בשם "הנהלה" מסומנות אוטומטית.
update public.departments
set is_management = true
where name like '%הנהלה%' and not is_management;

comment on column public.departments.is_management is
  'מחלקת הנהלה — בסידור שלה מופיעים גם מנהלי מחלקה ואחראי משמרת מכל העסק.';

notify pgrst, 'reload schema';
