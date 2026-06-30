-- ============================================================================
-- 026: הסכמים אישיים מסוג PDF עם שדות חתימה דיגיטליים
-- הרצה: Supabase Dashboard -> SQL Editor -> Run (לאחר schema.sql + patch_agreements.sql)
--
-- מה נוסף:
--  * agreement_templates.signature_fields — מיקומי תיבות החתימה שהמנהל מסמן
--    על כל עמוד ב-PDF. מערך של { id, page, x, y, w, h } כאשר x/y/w/h מנורמלים
--    ביחס לגודל העמוד (0..1).
--  * agreement_signatures.field_signatures — מיפוי fieldId -> תמונת חתימה (dataURL)
--    שהעובד צייר בכל תיבה.
--  * agreement_signatures.signed_file_url — ה-PDF הסופי החתום (עם החתימות מוטבעות).
--  * הידוק RLS: הסכם אישי חשוף רק לעובד שאליו הוא שויך (ולמנהלים).
-- ============================================================================

-- תלויות מ-patch_agreements.sql (אם לא הורצו עדיין)
alter table public.agreement_templates
  add column if not exists file_url text,
  add column if not exists employee_id uuid references public.profiles(id) on delete cascade;

alter table public.agreement_templates
  alter column content set default '';

create index if not exists idx_agr_templates_employee on public.agreement_templates(employee_id);

alter table public.agreement_templates
  add column if not exists signature_fields jsonb not null default '[]'::jsonb;

alter table public.agreement_signatures
  add column if not exists field_signatures jsonb not null default '{}'::jsonb,
  add column if not exists signed_file_url text;

-- ----------------------------------------------------------------------------
-- RLS: הסכם אישי חשוף רק לעובד המשויך + למנהלים
-- ----------------------------------------------------------------------------

-- agreement_templates: צפייה
drop policy if exists "agr_templates_tenant" on public.agreement_templates;

drop policy if exists "agr_templates_read" on public.agreement_templates;
create policy "agr_templates_read" on public.agreement_templates
  for select using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'office_manager', 'shift_manager')
      or employee_id is null          -- הסכם קבוע לכל העובדים
      or employee_id = auth.uid()     -- הסכם אישי — רק לעובד עצמו
    )
  );

-- agreement_templates: יצירה/עריכה/מחיקה — מנהלים בלבד
drop policy if exists "agr_templates_write" on public.agreement_templates;
create policy "agr_templates_write" on public.agreement_templates
  for all using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager')
  );

-- agreement_signatures: עובד רואה/חותם רק על שלו, מנהלים רואים הכל
drop policy if exists "agr_signatures_tenant" on public.agreement_signatures;
create policy "agr_signatures_tenant" on public.agreement_signatures
  for all using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'office_manager', 'shift_manager')
      or employee_id = auth.uid()
    )
  ) with check (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'office_manager', 'shift_manager')
      or employee_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Storage: bucket למסמכי הסכמים (PDF מקורי + PDF חתום)
-- נדרש כדי להעלות את קובצי ההסכם. אם ה-bucket כבר קיים — לא ישתנה דבר.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('agreements', 'agreements', true)
on conflict (id) do update set public = true;

drop policy if exists "agreements_upload" on storage.objects;
create policy "agreements_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'agreements');

drop policy if exists "agreements_read" on storage.objects;
create policy "agreements_read" on storage.objects
  for select using (bucket_id = 'agreements');

drop policy if exists "agreements_modify" on storage.objects;
create policy "agreements_modify" on storage.objects
  for update to authenticated using (bucket_id = 'agreements');

drop policy if exists "agreements_delete" on storage.objects;
create policy "agreements_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'agreements');
