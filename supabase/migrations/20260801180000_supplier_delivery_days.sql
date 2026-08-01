-- Multiple delivery days per supplier (was single delivery_day)

alter table public.suppliers
  add column if not exists delivery_days smallint[] default null;

update public.suppliers
set delivery_days = array[delivery_day]
where delivery_day is not null
  and (delivery_days is null or delivery_days = '{}');

alter table public.suppliers
  drop constraint if exists suppliers_delivery_days_check;

alter table public.suppliers
  add constraint suppliers_delivery_days_check
  check (
    delivery_days is null
    or (
      coalesce(array_length(delivery_days, 1), 0) > 0
      and delivery_days <@ array[0,1,2,3,4,5,6]::smallint[]
    )
  );

comment on column public.suppliers.delivery_days is 'ימי בשבוע שבהם הסחורה אמורה להגיע מהספק (0=ראשון, 6=שבת)';

alter table public.suppliers drop column if exists delivery_day;
