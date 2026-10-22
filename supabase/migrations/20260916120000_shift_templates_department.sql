-- משמרות לפי מחלקה: כל תבנית משמרת שייכת למחלקה אחת (או כללית כש-null).
-- לפני השינוי כל המשמרות היו גלובליות לעסק והוצגו בכל מחלקה.

alter table public.shift_templates
  add column if not exists department_id uuid references public.departments(id) on delete cascade;

create index if not exists idx_shift_templates_department
  on public.shift_templates(department_id);

comment on column public.shift_templates.department_id is
  'המחלקה שהמשמרת שייכת אליה. null = משמרת כללית (מוצגת בקבוצת "כללי" בסידור).';
