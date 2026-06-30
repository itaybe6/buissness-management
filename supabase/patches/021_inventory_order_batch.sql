-- קיבוץ שורות הזמנה (הזמנה אחת עם מספר מוצרים)
alter table public.inventory_orders
  add column if not exists batch_id uuid;

create index if not exists idx_inv_orders_batch on public.inventory_orders(batch_id);

comment on column public.inventory_orders.batch_id is 'מזהה משותף לכל שורות של אותה הזמנה';
