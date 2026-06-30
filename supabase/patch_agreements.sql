-- ============================================================================
-- Patch: הסכמים — employee_id, file_url לתבניות דינאמיות וקבצים מצורפים
-- הרצה: Supabase Dashboard -> SQL Editor (לאחר schema.sql)
-- ============================================================================

alter table public.agreement_templates
  add column if not exists file_url text,
  add column if not exists employee_id uuid references public.profiles(id) on delete cascade;

alter table public.agreement_templates
  alter column content set default '';

create index if not exists idx_agr_templates_employee on public.agreement_templates(employee_id);
