-- Move delivery day from inventory items to suppliers

alter table public.suppliers
  add column if not exists delivery_day smallint check (delivery_day between 0 and 6);

comment on column public.suppliers.delivery_day is 'יום בשבוע שבו הסחורה אמורה להגיע מהספק (0=ראשון, 6=שבת)';

-- Migrate existing item delivery days to linked suppliers (most common day per supplier)
update public.suppliers s
set delivery_day = sub.day
from (
  select
    si.supplier_id,
    mode() within group (order by i.supplier_delivery_day) as day
  from public.supplier_items si
  join public.inventory_items i on i.id = si.item_id
  where i.supplier_delivery_day is not null
  group by si.supplier_id
) sub
where s.id = sub.supplier_id
  and s.delivery_day is null;

alter table public.inventory_items
  drop column if exists supplier_delivery_day;
