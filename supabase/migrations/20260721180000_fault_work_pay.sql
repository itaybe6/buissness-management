-- Maintenance pay per completed fault (work price + manager approval)
-- See supabase/patches/044_fault_work_pay.sql

do $$ begin
  create type public.fault_pay_approval as enum ('pending', 'approved');
exception
  when duplicate_object then null;
end $$;

alter table public.faults
  add column if not exists work_price numeric(10,2),
  add column if not exists pay_employee_id uuid references public.profiles(id) on delete set null,
  add column if not exists pay_approval_status public.fault_pay_approval,
  add column if not exists pay_submitted_at timestamptz,
  add column if not exists pay_approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists pay_approved_at timestamptz;

alter table public.faults
  drop constraint if exists faults_work_price_nonneg;
alter table public.faults
  add constraint faults_work_price_nonneg
  check (work_price is null or work_price >= 0);

create index if not exists idx_faults_payroll
  on public.faults(business_id, pay_employee_id, pay_approved_at)
  where pay_approval_status = 'approved';
