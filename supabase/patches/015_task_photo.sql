-- ============================================================================
-- 015: צ'ק-ליסט משימות יומי לעובד — תמונה למשימה
-- העובד רואה בעמוד המשימות את כל המשימות הקבועות של אותו יום + משימות חד-פעמיות
-- ששויכו אליו, משנה סטטוס (מצריך טיפול / בטיפול / בוצע) ויכול לצרף תמונה.
-- הסטטוסים כבר קיימים ב-enum task_status ('open','in_progress','done').
-- ============================================================================

-- 1. עמודת תמונה למשימה (אופציונלי — העובד מצרף תמונת ביצוע)
alter table public.tasks add column if not exists photo_url text;

-- 2. Storage bucket לתמונות משימות
insert into storage.buckets (id, name, public)
values ('tasks', 'tasks', true)
on conflict (id) do update set public = true;

drop policy if exists "tasks_upload" on storage.objects;
create policy "tasks_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tasks');

drop policy if exists "tasks_read" on storage.objects;
create policy "tasks_read" on storage.objects
  for select using (bucket_id = 'tasks');

drop policy if exists "tasks_modify" on storage.objects;
create policy "tasks_modify" on storage.objects
  for update to authenticated using (bucket_id = 'tasks');
