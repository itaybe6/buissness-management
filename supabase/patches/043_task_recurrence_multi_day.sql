-- 043: תדירות משימה קבועה — בחירת כמה ימים בשבוע (smallint[])
-- ערכים: {-1} = כל יום, {0,2,4} = ראשון+שלישי+חמישי (כמו JS getDay)
-- ממיר ערכים ישנים: מספר בודד → מערך עם איבר אחד

-- task_templates
alter table public.task_templates
  drop constraint if exists task_templates_recurrence_weekday_check;

alter table public.task_templates
  alter column recurrence_weekday type smallint[]
  using (
    case
      when recurrence_weekday is null then null
      else array[recurrence_weekday]::smallint[]
    end
  );

alter table public.task_templates
  add constraint task_templates_recurrence_weekday_check
  check (
    recurrence_weekday is null
    or (
      cardinality(recurrence_weekday) >= 1
      and recurrence_weekday <@ array[-1, 0, 1, 2, 3, 4, 5, 6]::smallint[]
    )
  );

comment on column public.task_templates.recurrence_weekday is
  'ימי תדירות: {-1}=כל יום, אחרת תת-קבוצה של 0–6 (ראשון–שבת)';

-- tasks (שורות ממומשות / משימות קבועות שנוצרו)
alter table public.tasks
  alter column recurrence_weekday type smallint[]
  using (
    case
      when recurrence_weekday is null then null
      else array[recurrence_weekday]::smallint[]
    end
  );

comment on column public.tasks.recurrence_weekday is
  'ימי תדירות למשימה קבועה: {-1}=כל יום, אחרת 0–6';
