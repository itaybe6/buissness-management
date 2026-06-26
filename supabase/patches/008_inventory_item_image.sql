-- תמונת מוצר בטבלת inventory_items + bucket Storage
-- הרצה: Supabase Dashboard → SQL Editor (או דרך MCP apply_migration)

alter table public.inventory_items add column if not exists image_url text;

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
