-- Dynamic inventory product categories per business (replaces inventory_items.category text)

create table if not exists public.inventory_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  color       text default '#8b939e',
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.inventory_categories is 'קטגוריות מוצרים — מוגדרות על ידי מנהל העסק';

create unique index if not exists idx_inv_categories_business_name
  on public.inventory_categories (business_id, lower(trim(name)));

create index if not exists idx_inv_categories_business
  on public.inventory_categories (business_id, sort_order);

alter table public.inventory_categories enable row level security;

drop policy if exists "inv_categories_read" on public.inventory_categories;
create policy "inv_categories_read" on public.inventory_categories
  for select using (public.can_access(business_id));

drop policy if exists "inv_categories_manager_write" on public.inventory_categories;
create policy "inv_categories_manager_write" on public.inventory_categories
  for all using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  );

alter table public.inventory_items
  add column if not exists category_id uuid references public.inventory_categories(id) on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_items'
      and column_name = 'category'
  ) then
    insert into public.inventory_categories (business_id, name, sort_order, color)
    select t.business_id, t.name, t.sort_order, t.color
    from (
      select distinct
        i.business_id,
        case trim(i.category)
          when 'dairy' then 'חלבי'
          when 'alcohol' then 'אלכוהול'
          when 'dry' then 'יבשים'
          when 'beverages' then 'משקאות'
          when 'meat_fish' then 'בשר ודגים'
          when 'produce' then 'ירקות ופירות'
          when 'frozen' then 'קפואים'
          when 'cleaning' then 'חומרי ניקוי'
          when 'other' then 'אחר'
          else trim(i.category)
        end as name,
        case trim(i.category)
          when 'dairy' then 0
          when 'alcohol' then 1
          when 'dry' then 2
          when 'beverages' then 3
          when 'meat_fish' then 4
          when 'produce' then 5
          when 'frozen' then 6
          when 'cleaning' then 7
          when 'other' then 8
          else 99
        end as sort_order,
        case trim(i.category)
          when 'dairy' then '#4b93f7'
          when 'alcohol' then '#a05de0'
          when 'dry' then '#d1912c'
          when 'beverages' then '#12a5b4'
          when 'meat_fish' then '#e2445c'
          when 'produce' then '#1fb974'
          when 'frozen' then '#3fb8ef'
          when 'cleaning' then '#7480ea'
          else '#8b939e'
        end as color
      from public.inventory_items i
      where i.category is not null and trim(i.category) <> ''
    ) t
    where not exists (
      select 1 from public.inventory_categories c
      where c.business_id = t.business_id
        and lower(trim(c.name)) = lower(trim(t.name))
    );

    update public.inventory_items i
    set category_id = c.id
    from public.inventory_categories c
    where i.business_id = c.business_id
      and i.category is not null
      and trim(i.category) <> ''
      and lower(trim(c.name)) = lower(trim(
        case trim(i.category)
          when 'dairy' then 'חלבי'
          when 'alcohol' then 'אלכוהול'
          when 'dry' then 'יבשים'
          when 'beverages' then 'משקאות'
          when 'meat_fish' then 'בשר ודגים'
          when 'produce' then 'ירקות ופירות'
          when 'frozen' then 'קפואים'
          when 'cleaning' then 'חומרי ניקוי'
          when 'other' then 'אחר'
          else trim(i.category)
        end
      ));

    alter table public.inventory_items drop column category;
  end if;
end $$;

drop index if exists public.idx_inv_items_category;
create index if not exists idx_inv_items_category_id on public.inventory_items(business_id, category_id);
