-- שלב 2: מדיה, מדיניות RLS ו-Storage (לאחר patch 038)
-- הרצה: Supabase Dashboard -> SQL Editor

alter table public.events
  add column if not exists media_urls text[] not null default '{}';

drop policy if exists "events_tenant" on public.events;

create policy "events_read" on public.events
  for select using (public.can_access(business_id));

create policy "events_insert" on public.events
  for insert with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'event_manager')
  );

create policy "events_update" on public.events
  for update using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'event_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'event_manager')
  );

create policy "events_delete" on public.events
  for delete using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'event_manager')
  );

insert into storage.buckets (id, name, public)
values ('events', 'events', true)
on conflict (id) do update set public = true;

drop policy if exists "events_upload" on storage.objects;
create policy "events_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'events');

drop policy if exists "events_storage_read" on storage.objects;
create policy "events_storage_read" on storage.objects
  for select using (bucket_id = 'events');

drop policy if exists "events_storage_modify" on storage.objects;
create policy "events_storage_modify" on storage.objects
  for update to authenticated using (bucket_id = 'events');
