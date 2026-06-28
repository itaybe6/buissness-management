-- ============================================================================
-- Storage: bucket לתמונות תקלות (מודול דיווח תקלות)
-- הרצה: Supabase Dashboard -> SQL Editor -> Run (לאחר הרצת schema.sql)
-- אפשר גם ליצור את ה-bucket ידנית: Storage -> New bucket -> name: faults, Public: on
-- ============================================================================

-- יצירת bucket ציבורי בשם faults (תמונות נגישות לצפייה דרך URL)
insert into storage.buckets (id, name, public)
values ('faults', 'faults', true)
on conflict (id) do update set public = true;

-- מדיניות: משתמשים מחוברים יכולים להעלות תמונות לתקלות
drop policy if exists "faults_upload" on storage.objects;
create policy "faults_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'faults');

-- מדיניות: צפייה ציבורית בתמונות התקלות (bucket ציבורי)
drop policy if exists "faults_read" on storage.objects;
create policy "faults_read" on storage.objects
  for select using (bucket_id = 'faults');

-- מדיניות: מחיקה/עדכון ע"י משתמשים מחוברים (אופציונלי)
drop policy if exists "faults_modify" on storage.objects;
create policy "faults_modify" on storage.objects
  for update to authenticated using (bucket_id = 'faults');

-- ============================================================================
-- Storage: bucket לתמונות מוצרים (מודול סחורות / מלאי)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('inventory', 'inventory', true)
on conflict (id) do update set public = true;

drop policy if exists "inventory_upload" on storage.objects;
create policy "inventory_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inventory');

drop policy if exists "inventory_read" on storage.objects;
create policy "inventory_read" on storage.objects
  for select using (bucket_id = 'inventory');

drop policy if exists "inventory_modify" on storage.objects;
create policy "inventory_modify" on storage.objects
  for update to authenticated using (bucket_id = 'inventory');

-- ============================================================================
-- Storage: bucket לחשבוניות (מודול דוח סגירת משמרת)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do update set public = true;

drop policy if exists "invoices_upload" on storage.objects;
create policy "invoices_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'invoices');

drop policy if exists "invoices_read" on storage.objects;
create policy "invoices_read" on storage.objects
  for select using (bucket_id = 'invoices');

drop policy if exists "invoices_modify" on storage.objects;
create policy "invoices_modify" on storage.objects
  for update to authenticated using (bucket_id = 'invoices');

drop policy if exists "invoices_delete" on storage.objects;
create policy "invoices_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'invoices');

-- ============================================================================
-- Storage: bucket לתמונות משימות (צ'ק-ליסט משימות יומי לעובד)
-- ============================================================================

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
