-- Order days per supplier — when orders should typically be placed

alter table public.suppliers
  add column if not exists order_days smallint[] default null;

alter table public.suppliers
  drop constraint if exists suppliers_order_days_check;

alter table public.suppliers
  add constraint suppliers_order_days_check
  check (
    order_days is null
    or (
      coalesce(array_length(order_days, 1), 0) > 0
      and order_days <@ array[0,1,2,3,4,5,6]::smallint[]
    )
  );

comment on column public.suppliers.order_days is 'ימי בשבוע שבהם בדרך כלל יוצאת הזמנה לספק (0=ראשון, 6=שבת)';
