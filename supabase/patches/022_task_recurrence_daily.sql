-- ============================================================================
-- 022: תדירות "כל יום" למשימות קבועות (recurrence_weekday = -1)
-- ============================================================================

alter table public.task_templates
  drop constraint if exists task_templates_recurrence_weekday_check;

alter table public.task_templates
  add constraint task_templates_recurrence_weekday_check
  check (
    recurrence_weekday is null
    or (recurrence_weekday >= -1 and recurrence_weekday <= 6)
  );
