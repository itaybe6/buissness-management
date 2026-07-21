-- ============================================================================
-- 045: טופס 101 — תבנית גלובלית בלבד (מיזוג תבניות ישנות פר-עובד)
-- הרצה: Supabase Dashboard -> SQL Editor
-- ============================================================================

-- Consolidate per-employee Form 101 agreement templates into one global template per business.
-- Form 101 is a blank download + scanned upload; no per-employee templates or signature boxes.

update public.agreement_templates
set signature_fields = '[]'::jsonb
where type = 'form_101';

do $$
declare
  bid uuid;
  global_id uuid;
  tmpl_id uuid;
begin
  for bid in
    select distinct business_id
    from public.agreement_templates
    where type = 'form_101'
  loop
    select id into global_id
    from public.agreement_templates
    where business_id = bid
      and type = 'form_101'
      and employee_id is null
    order by created_at asc
    limit 1;

    if global_id is null then
      insert into public.agreement_templates (
        business_id, type, title, content, file_url, signature_fields, employee_id
      )
      select
        business_id,
        'form_101',
        coalesce(nullif(trim(title), ''), 'טופס 101'),
        '',
        file_url,
        '[]'::jsonb,
        null
      from public.agreement_templates
      where business_id = bid
        and type = 'form_101'
        and employee_id is not null
      order by (file_url is not null) desc, created_at asc
      limit 1
      returning id into global_id;

      if global_id is null then
        continue;
      end if;
    end if;

    update public.agreement_templates g
    set file_url = coalesce(
      g.file_url,
      (
        select p.file_url
        from public.agreement_templates p
        where p.business_id = bid
          and p.type = 'form_101'
          and p.id <> global_id
          and p.file_url is not null
        order by p.created_at desc
        limit 1
      )
    )
    where g.id = global_id;

    for tmpl_id in
      select id
      from public.agreement_templates
      where business_id = bid
        and type = 'form_101'
        and id <> global_id
    loop
      insert into public.agreement_signatures (
        business_id,
        agreement_id,
        employee_id,
        agreed,
        signature_data,
        field_signatures,
        signed_file_url,
        signed_at,
        email_notified_at
      )
      select
        s.business_id,
        global_id,
        s.employee_id,
        s.agreed,
        s.signature_data,
        '{}'::jsonb,
        s.signed_file_url,
        s.signed_at,
        s.email_notified_at
      from public.agreement_signatures s
      where s.agreement_id = tmpl_id
      on conflict (agreement_id, employee_id) do update set
        agreed = public.agreement_signatures.agreed or excluded.agreed,
        signature_data = coalesce(public.agreement_signatures.signature_data, excluded.signature_data),
        field_signatures = '{}'::jsonb,
        signed_file_url = coalesce(public.agreement_signatures.signed_file_url, excluded.signed_file_url),
        signed_at = coalesce(public.agreement_signatures.signed_at, excluded.signed_at),
        email_notified_at = coalesce(
          public.agreement_signatures.email_notified_at,
          excluded.email_notified_at
        );

      delete from public.agreement_templates where id = tmpl_id;
    end loop;
  end loop;
end $$;

alter table public.agreement_templates
  drop constraint if exists agreement_templates_form101_global_only;

alter table public.agreement_templates
  add constraint agreement_templates_form101_global_only
  check (type <> 'form_101'::public.agreement_type or employee_id is null);

create unique index if not exists agreement_templates_one_form101_per_business
  on public.agreement_templates (business_id)
  where type = 'form_101' and employee_id is null;
