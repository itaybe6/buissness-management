-- Track when office manager was notified about Form 101 submission (prevents duplicate emails)
alter table public.form_101
  add column if not exists email_notified_at timestamptz;
