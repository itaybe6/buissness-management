-- ============================================================================
-- 031: הכנה למחיקת עובד — ניקוי הפניות שלא נמחקות אוטומטית
-- לפני מחיקת auth.users (שמוחקת את profiles ב-cascade).
-- ============================================================================

create or replace function public.prep_delete_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- הפניות אופציונליות ללא ON DELETE — מאפסים כדי לא לחסום מחיקה
  update public.agreement_templates set created_by = null where created_by = p_user_id;
  update public.shift_assignments set assigned_by = null where assigned_by = p_user_id;
  update public.shift_reports set created_by = null where created_by = p_user_id;
  update public.payroll_records set created_by = null where created_by = p_user_id;
  update public.inventory_counts set employee_id = null where employee_id = p_user_id;
  update public.inventory_orders set ordered_by = null where ordered_by = p_user_id;
  update public.inventory_waste set employee_id = null where employee_id = p_user_id;
  update public.inventory_logs set employee_id = null where employee_id = p_user_id;
  update public.faults set reported_by = null where reported_by = p_user_id;
  update public.faults set assigned_to = null where assigned_to = p_user_id;
  update public.events set created_by = null where created_by = p_user_id;
  update public.tasks set assigned_to = null where assigned_to = p_user_id;
  update public.tasks set assigned_by = null where assigned_by = p_user_id;

  -- office_receipts (מ-patch 019 — אם הטבלה קיימת)
  if to_regclass('public.office_receipts') is not null then
    execute 'update public.office_receipts set created_by = null where created_by = $1'
      using p_user_id;
  end if;
end;
$$;

comment on function public.prep_delete_profile(uuid) is
  'מאפס הפניות לפרופיל לפני מחיקת משתמש Auth. שאר הטבלאות עם ON DELETE CASCADE נמחקות אוטומטית.';
