-- An employee can delete their own signed upload and send a different file.

drop policy if exists "agr_signatures_delete" on public.agreement_signatures;
create policy "agr_signatures_delete" on public.agreement_signatures
  for delete using (
    public.can_access(business_id) and employee_id = auth.uid()
  );
