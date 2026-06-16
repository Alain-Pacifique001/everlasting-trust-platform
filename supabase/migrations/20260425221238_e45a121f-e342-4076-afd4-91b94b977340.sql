
-- 1. Add public join_code to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS join_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_join_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  IF NEW.join_code IS NULL THEN
    LOOP
      candidate := public.generate_join_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_code = candidate);
      attempts := attempts + 1;
      IF attempts > 10 THEN EXIT; END IF;
    END LOOP;
    NEW.join_code := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_org_join_code ON public.organizations;
CREATE TRIGGER trg_set_org_join_code
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_org_join_code();

-- Backfill existing organizations with join codes
UPDATE public.organizations
SET join_code = public.generate_join_code()
WHERE join_code IS NULL;

-- 2. Membership requests table
CREATE TABLE IF NOT EXISTS public.membership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text DEFAULT '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_membership_requests_org ON public.membership_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_membership_requests_user ON public.membership_requests(user_id);

-- Status validation trigger (CHECK can't easily be modified later; trigger preferred per guidelines)
CREATE OR REPLACE FUNCTION public.validate_membership_request_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_membership_request_status ON public.membership_requests;
CREATE TRIGGER trg_validate_membership_request_status
  BEFORE INSERT OR UPDATE ON public.membership_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_membership_request_status();

ALTER TABLE public.membership_requests ENABLE ROW LEVEL SECURITY;

-- Users can submit a request for themselves
CREATE POLICY "Users submit own membership request"
  ON public.membership_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users see their own requests
CREATE POLICY "Users view own requests"
  ON public.membership_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Org owners/accountants see all requests for their org
CREATE POLICY "Org admins view org requests"
  ON public.membership_requests FOR SELECT
  USING (
    public.has_role(auth.uid(), organization_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'accountant'::app_role)
  );

-- Users can cancel their own pending request
CREATE POLICY "Users cancel own pending request"
  ON public.membership_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Org owners/accountants can review requests
CREATE POLICY "Org admins review requests"
  ON public.membership_requests FOR UPDATE
  USING (
    public.has_role(auth.uid(), organization_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), organization_id, 'accountant'::app_role)
  );

-- 3. Trigger: when a request is approved, create the membership
CREATE OR REPLACE FUNCTION public.handle_membership_request_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.organization_members (user_id, organization_id, role)
    VALUES (NEW.user_id, NEW.organization_id, 'viewer'::public.app_role)
    ON CONFLICT (user_id) DO UPDATE
      SET organization_id = EXCLUDED.organization_id,
          updated_at = now();

    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      NEW.user_id,
      'Membership approved',
      'Your request to join the organization was approved. Welcome aboard!',
      'success',
      '/'
    );
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id,
      'Membership request rejected',
      'Your request to join the organization was not approved.',
      'warning'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_request_approval ON public.membership_requests;
CREATE TRIGGER trg_membership_request_approval
  AFTER UPDATE ON public.membership_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_membership_request_approval();

-- 4. Helper: lookup organization by join code (security definer so users can find without seeing all orgs)
CREATE OR REPLACE FUNCTION public.find_org_by_code(_code text)
RETURNS TABLE (id uuid, name text, type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, type FROM public.organizations WHERE join_code = upper(_code) LIMIT 1;
$$;

-- 5. MFA recovery codes
CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON public.mfa_recovery_codes(user_id);

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own recovery codes"
  ON public.mfa_recovery_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own recovery codes"
  ON public.mfa_recovery_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own recovery codes"
  ON public.mfa_recovery_codes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own recovery codes"
  ON public.mfa_recovery_codes FOR DELETE
  USING (auth.uid() = user_id);
