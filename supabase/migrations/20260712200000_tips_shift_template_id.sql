-- Align tips table with shift report tip sync (shift_template_id instead of legacy period-only rows).

alter table public.tips
  add column if not exists shift_template_id uuid references public.shift_templates(id) on delete set null;

create index if not exists idx_tips_shift_template on public.tips(shift_template_id);
