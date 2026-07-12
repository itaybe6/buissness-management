-- Per-employee register-percentage bonus (configured on Users page, applied on shift reports).

alter table public.profiles
  add column if not exists bonus_pct numeric(5,2) not null default 0;

comment on column public.profiles.bonus_pct is
  'אחוז מסכום הקופה (total_sales) שהעובד מקבל כתוספת שכר במשמרות שעבד בהן';
