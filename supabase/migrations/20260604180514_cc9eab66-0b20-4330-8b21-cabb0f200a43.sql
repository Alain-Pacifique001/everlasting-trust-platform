
-- =========================
-- 1) role_permissions table
-- =========================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_manage boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role, module)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view role permissions"
  ON public.role_permissions FOR SELECT
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners/CEO manage role permissions"
  ON public.role_permissions FOR ALL
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner'::public.app_role, 'ceo'::public.app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner'::public.app_role, 'ceo'::public.app_role]));

CREATE TRIGGER trg_role_permissions_updated
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_role_permissions_org_module
  ON public.role_permissions (organization_id, module);

-- =========================
-- 2) presence_telemetry table
-- =========================
CREATE TABLE IF NOT EXISTS public.presence_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  channel text NOT NULL,
  event_type text NOT NULL,
  latency_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.presence_telemetry TO authenticated;
GRANT ALL ON public.presence_telemetry TO service_role;

ALTER TABLE public.presence_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User inserts own telemetry"
  ON public.presence_telemetry FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "User views own telemetry"
  ON public.presence_telemetry FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Leaders view org telemetry"
  ON public.presence_telemetry FOR SELECT
  USING (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner'::public.app_role,'ceo'::public.app_role,'cfo'::public.app_role,'hr_manager'::public.app_role,'auditor'::public.app_role]));

CREATE INDEX IF NOT EXISTS idx_presence_telemetry_org_created
  ON public.presence_telemetry (organization_id, created_at DESC);

-- =========================
-- 3) Voice briefings visibility with assignments
-- =========================
DROP POLICY IF EXISTS "Org members view briefings" ON public.voice_briefings;
CREATE POLICY "Org members view briefings"
  ON public.voice_briefings FOR SELECT
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (
      auth.uid() = created_by
      OR public.has_any_role(auth.uid(), organization_id,
           ARRAY['owner'::public.app_role,'ceo'::public.app_role,'cfo'::public.app_role,'hr_manager'::public.app_role,'auditor'::public.app_role])
      OR NOT EXISTS (SELECT 1 FROM public.voice_briefing_assignments a WHERE a.briefing_id = id)
      OR EXISTS (SELECT 1 FROM public.voice_briefing_assignments a WHERE a.briefing_id = id AND a.user_id = auth.uid())
    )
  );

-- =========================
-- 4) Storage policies for voice-briefings bucket
-- =========================
DO $$ BEGIN
  -- bucket created via storage_create_bucket; policies below.
  NULL;
END $$;

DROP POLICY IF EXISTS "Public read voice briefings" ON storage.objects;
CREATE POLICY "Public read voice briefings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voice-briefings');

DROP POLICY IF EXISTS "Authenticated upload voice briefings" ON storage.objects;
CREATE POLICY "Authenticated upload voice briefings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice-briefings' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Owner delete voice briefings" ON storage.objects;
CREATE POLICY "Owner delete voice briefings"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'voice-briefings' AND auth.uid()::text = (storage.foldername(name))[1]);
