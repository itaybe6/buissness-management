create schema if not exists private;

create table if not exists private.runtime_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table private.runtime_secrets enable row level security;
-- No policies: only service_role (edge functions) can access.
