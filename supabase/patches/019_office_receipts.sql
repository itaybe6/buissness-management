-- ============================================================================
-- 019: חשבוניות וקבלות למנהלת משרד (office_receipts)
-- העלאת חשבונית מס / חשבונית מס קבלה / קבלה עם סכום, פרטי ספק וקובץ.
-- ============================================================================

-- 1. סוג מסמך
do $$ begin
  create type public.receipt_type as enum (
    'tax_invoice',           -- חשבונית מס
    'tax_invoice_receipt',   -- חשבונית מס קבלה
    'receipt'                -- קבלה
  );
exception when duplicate_object then null;
end $$;

-- 2. טבלה
create table if not exists public.office_receipts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  type            public.receipt_type not null,
  amount          numeric(12,2) not null default 0,
  vendor_name     text not null,
  vendor_details  text,
  document_date   date,
  file_url        text not null,
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.office_receipts is 'חשבוניות וקבלות שהועלו ע״י מנהלת המשרד';

-- 3. אינדקסים
create index if not exists idx_office_receipts_business on public.office_receipts(business_id);
create index if not exists idx_office_receipts_date on public.office_receipts(business_id, document_date desc nulls last);

-- 4. טריגר updated_at
drop trigger if exists office_receipts_updated_at on public.office_receipts;
create trigger office_receipts_updated_at
  before update on public.office_receipts
  for each row execute function public.set_updated_at();

-- 5. RLS
alter table public.office_receipts enable row level security;
drop policy if exists "office_receipts_tenant" on public.office_receipts;
create policy "office_receipts_tenant" on public.office_receipts
  for all using (public.can_access(business_id)) with check (public.can_access(business_id));
