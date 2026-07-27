-- שם ברירת מחדל למחסן הראשון: «מלאי העסק» + יצירה אוטומטית לעסק חדש

update public.warehouses
set name = 'מלאי העסק'
where is_default = true
  and lower(trim(name)) = lower(trim('מחסן ראשי'));

create or replace function public.seed_default_warehouse(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.warehouses (business_id, name, sort_order, is_default)
  select p_business_id, 'מלאי העסק', 0, true
  where not exists (
    select 1 from public.warehouses w where w.business_id = p_business_id
  );
end;
$$;

create or replace function public.trg_business_seed_warehouse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_warehouse(new.id);
  return new;
end;
$$;

drop trigger if exists trg_business_seed_warehouse on public.businesses;
create trigger trg_business_seed_warehouse
  after insert on public.businesses
  for each row execute function public.trg_business_seed_warehouse();

-- עסקים קיימים בלי מחסן
select public.seed_default_warehouse(b.id)
from public.businesses b
where not exists (
  select 1 from public.warehouses w where w.business_id = b.id
);
