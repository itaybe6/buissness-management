-- יום אספקה מהספק לכל פריט מלאי (0=ראשון … 6=שבת, כמו JS getDay)
alter table public.inventory_items
  add column if not exists supplier_delivery_day smallint check (supplier_delivery_day between 0 and 6);

comment on column public.inventory_items.supplier_delivery_day is 'יום בשבוע שבו הסחורה אמורה להגיע מהספק (0=ראשון, 6=שבת)';
