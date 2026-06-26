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
