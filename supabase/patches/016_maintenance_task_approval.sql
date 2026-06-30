-- ============================================================================
-- 016: אישור מנהל למשימות תחזוקה שמוריד אחראי משמרת
-- מנהל או אחראי משמרת יכולים להוריד משימות לאיש אחזקה.
-- כשמתג העסק (maintenance_task_approval) דלוק — משימה שאחראי משמרת מוריד
-- לאיש אחזקה לא מגיעה ישירות אליו, אלא ממתינה לאישור מנהל (approval_status='pending').
-- רק לאחר שהמנהל מאשר (approval_status='approved') היא מופיעה אצל איש האחזקה.
-- משימות רגילות (approval_status = null) מתנהגות כרגיל ללא שינוי.
-- ============================================================================

-- 1. מתג לכל עסק: האם לדרוש אישור מנהל למשימות שאחראי משמרת מוריד לאיש אחזקה
alter table public.businesses
  add column if not exists maintenance_task_approval boolean not null default false;

-- 2. סטטוס אישור למשימה
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_approval') then
    create type public.task_approval as enum ('pending', 'approved');
  end if;
end$$;

-- 3. עמודת אישור במשימות (null = לא דורש אישור)
alter table public.tasks
  add column if not exists approval_status public.task_approval;

-- 4. אינדקס לתור האישורים של המנהל
create index if not exists idx_tasks_approval
  on public.tasks(business_id, approval_status)
  where approval_status is not null;
