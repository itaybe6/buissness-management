-- ספקים קבועים, קישור להזמנות מלאי ולמסמכים פיננסיים

create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  phone         text,
  tax_id        text,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.suppliers is 'ספקים קבועים לעסק — הזמנות מלאי ומסמכים פיננסיים';

create index if not exists idx_suppliers_business on public.suppliers(business_id);
create index if not exists idx_suppliers_business_active on public.suppliers(business_id, active);

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;
drop policy if exists "suppliers_tenant" on public.suppliers;
create policy "suppliers_tenant" on public.suppliers
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));

alter table public.inventory_orders
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists idx_inv_orders_supplier on public.inventory_orders(business_id, supplier_id);

do $$ begin
  if to_regclass('public.office_receipts') is not null then
    alter table public.office_receipts
      add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
    create index if not exists idx_office_receipts_supplier
      on public.office_receipts(business_id, supplier_id);
  end if;
end $$;
