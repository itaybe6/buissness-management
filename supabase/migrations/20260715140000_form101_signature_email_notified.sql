alter table public.agreement_signatures
  add column if not exists email_notified_at timestamptz;
