-- Track who last updated task status or uploaded documentation.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS last_documented_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_documented_at timestamptz;

COMMENT ON COLUMN public.tasks.last_documented_by IS 'Profile who last changed status or uploaded task documentation';
COMMENT ON COLUMN public.tasks.last_documented_at IS 'When the last status change or media upload occurred';
