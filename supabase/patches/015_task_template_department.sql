-- ============================================================================
-- 015: שיוך משימה קבועה למחלקה (task_templates.department_id)
-- משימה קבועה שייכת למחלקה מסוימת או שהיא כללית לכל העסק (department_id = null).
-- משימה קבועה אינה משויכת לעובד בודד — היא מוצגת לכל עובדי המחלקה,
-- ולמשימות כלליות לכלל העסק.
-- ============================================================================

alter table public.task_templates
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_task_templates_department on public.task_templates(department_id);
