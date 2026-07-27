-- Optional birth date per employee (HR records).

alter table public.profiles
  add column if not exists birth_date date;

comment on column public.profiles.birth_date is
  'תאריך לידה (אופציונלי)';
