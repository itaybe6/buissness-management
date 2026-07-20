-- Track who last changed fault status and when.
ALTER TABLE public.faults
  ADD COLUMN IF NOT EXISTS status_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

COMMENT ON COLUMN public.faults.status_updated_by IS 'Profile who last changed fault status';
COMMENT ON COLUMN public.faults.status_updated_at IS 'When fault status was last changed';
