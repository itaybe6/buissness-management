-- סידור לפי שורות: כל שורה (shift_template) היא עמדה של עובד אחד בטווח שעות.
-- כדי לשבץ שני מארחים בערב מוסיפים שתי שורות "אירוח ערב".
--
-- 1. שיבוצים: מקסימום עובד אחד לשורה ביום. תאים שהיו בהם כמה עובדים
--    מפוצלים לשורות משוכפלות (אותו שם, שעות וימים), כך ששום שיבוץ לא נמחק.
-- 2. אילוצים: נשמרים לפי טווח שעות ביום (start_time/end_time) ולא לפי שורה,
--    כך שעובד מסמן "אירוח ערב 19:30–23:30" פעם אחת גם כשיש לו כמה שורות זהות,
--    והאילוץ שורד מחיקה/שכפול של שורות.

-- ---------------------------------------------------------------------------
-- 1. פיצול תאים עם כמה עובדים לשורות נפרדות
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  i integer;
  new_id uuid;
begin
  for r in
    select shift_template_id, max(cnt) as max_cnt
    from (
      select shift_template_id, shift_date, count(*) as cnt
      from public.shift_assignments
      group by shift_template_id, shift_date
    ) cells
    group by shift_template_id
    having max(cnt) > 1
  loop
    for i in 1 .. r.max_cnt - 1 loop
      insert into public.shift_templates
        (business_id, department_id, shift_key, name, start_time, end_time, color, active, sort_order)
      select business_id, department_id, null, name, start_time, end_time, color, active, sort_order
      from public.shift_templates
      where id = r.shift_template_id
      returning id into new_id;

      insert into public.shift_template_days (shift_template_id, day_of_week, start_time, end_time)
      select new_id, day_of_week, start_time, end_time
      from public.shift_template_days
      where shift_template_id = r.shift_template_id;

      -- העובד השני בכל תא עובר לשורה החדשה; בסבב הבא — השני מבין מי שנשאר.
      update public.shift_assignments sa
      set shift_template_id = new_id
      from (
        select id, row_number() over (partition by shift_date order by created_at, id) as rn
        from public.shift_assignments
        where shift_template_id = r.shift_template_id
      ) ranked
      where sa.id = ranked.id and ranked.rn = 2;
    end loop;
  end loop;
end $$;

create unique index if not exists idx_shift_assign_one_per_row
  on public.shift_assignments (shift_template_id, shift_date);

comment on index public.idx_shift_assign_one_per_row is
  'כל שורה בסידור מחזיקה עובד אחד ביום.';

-- ---------------------------------------------------------------------------
-- 2. אילוצים לפי טווח שעות
-- ---------------------------------------------------------------------------
alter table public.shift_preferences
  add column if not exists start_time time,
  add column if not exists end_time time;

-- מילוי השעות לאילוצים קיימים: שעות השורה ביום של האילוץ, או שעות הכותרת.
update public.shift_preferences p
set
  start_time = coalesce(
    (select d.start_time from public.shift_template_days d
      where d.shift_template_id = t.id and d.day_of_week = extract(dow from p.shift_date)::smallint),
    t.start_time),
  end_time = coalesce(
    (select d.end_time from public.shift_template_days d
      where d.shift_template_id = t.id and d.day_of_week = extract(dow from p.shift_date)::smallint),
    t.end_time)
from public.shift_templates t
where t.id = p.shift_template_id
  and p.start_time is null;

-- אילוצים שלא נמצאו להם שעות (לא אמור לקרות) — אין להם משמעות בלי טווח.
delete from public.shift_preferences where start_time is null or end_time is null;

-- כפילויות (אותו עובד, יום וטווח משתי שורות שונות): "לא יכול" גובר, אחרת האחרון.
delete from public.shift_preferences p
using (
  select id,
         row_number() over (
           partition by employee_id, shift_date, start_time, end_time
           order by (preference = 'cannot') desc, created_at desc, id
         ) as rn
  from public.shift_preferences
) ranked
where p.id = ranked.id and ranked.rn > 1;

alter table public.shift_preferences
  alter column start_time set not null,
  alter column end_time set not null,
  alter column shift_template_id drop not null;

alter table public.shift_preferences
  drop constraint if exists shift_preferences_employee_id_shift_date_shift_template_id_key;

alter table public.shift_preferences
  drop constraint if exists shift_preferences_shift_template_id_fkey;
alter table public.shift_preferences
  add constraint shift_preferences_shift_template_id_fkey
  foreign key (shift_template_id) references public.shift_templates(id) on delete set null;

create unique index if not exists idx_shift_pref_window
  on public.shift_preferences (employee_id, shift_date, start_time, end_time);

comment on column public.shift_preferences.start_time is
  'תחילת טווח השעות שהעובד סימן עליו זמינות. האילוץ חל על כל שורה בסידור עם אותו טווח באותו יום.';
comment on column public.shift_preferences.shift_template_id is
  'מיושן — אילוצים נשמרים לפי טווח שעות (start_time/end_time).';

notify pgrst, 'reload schema';
