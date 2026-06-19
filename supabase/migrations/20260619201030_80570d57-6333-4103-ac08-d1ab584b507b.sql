
-- Add cancellation tracking + ensure cancelled status preserved
ALTER TABLE public.audit_export_jobs
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Allow org auditors to UPDATE jobs (existing policy is FOR ALL but let's ensure)
-- Already covered by has_any_role policy. Add audit-log trigger so cancellations get recorded.

CREATE OR REPLACE FUNCTION public.audit_export_job_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    INSERT INTO public.rbac_audit_log (
      organization_id, actor_user_id, event_type, metadata, created_at
    ) VALUES (
      NEW.organization_id,
      COALESCE(NEW.cancelled_by, NEW.requested_by),
      'audit_export.cancelled',
      jsonb_build_object('job_id', NEW.id, 'previous_status', OLD.status, 'reason', NEW.cancellation_reason),
      now()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_export_cancel_audit ON public.audit_export_jobs;
CREATE TRIGGER trg_export_cancel_audit
AFTER UPDATE ON public.audit_export_jobs
FOR EACH ROW EXECUTE FUNCTION public.audit_export_job_cancelled();
