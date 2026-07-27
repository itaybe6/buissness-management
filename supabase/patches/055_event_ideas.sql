-- 055: רעיונות עובדים לאירועים

create table if not exists public.event_ideas (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_event_ideas_business on public.event_ideas (business_id, created_at desc);

alter table public.event_ideas enable row level security;

create policy "event_ideas_read" on public.event_ideas
  for select using (public.can_access(business_id));

create policy "event_ideas_insert" on public.event_ideas
  for insert with check (
    public.can_access(business_id)
    and created_by = auth.uid()
  );

create policy "event_ideas_update" on public.event_ideas
  for update using (
    public.can_access(business_id)
    and (
      created_by = auth.uid()
      or public.auth_role() in ('manager', 'event_manager')
    )
  ) with check (public.can_access(business_id));

create policy "event_ideas_delete" on public.event_ideas
  for delete using (
    public.can_access(business_id)
    and (
      created_by = auth.uid()
      or public.auth_role() in ('manager', 'event_manager')
    )
  );

drop trigger if exists trg_event_ideas_updated on public.event_ideas;
create trigger trg_event_ideas_updated
  before update on public.event_ideas
  for each row execute function public.set_updated_at();
