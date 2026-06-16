CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _org_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org_id AND role = ANY(_roles));
$$;

CREATE OR REPLACE FUNCTION public.get_active_org(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(((SELECT preferences FROM public.user_settings WHERE user_id = _user_id) ->> 'activeOrganizationId'), '')::uuid,
    (SELECT organization_id FROM public.organization_members WHERE user_id = _user_id ORDER BY created_at LIMIT 1)
  );
$$;

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name text NOT NULL, description text DEFAULT '',
  head_user_id uuid, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
CREATE INDEX IF NOT EXISTS idx_departments_org ON public.departments(organization_id);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view departments" ON public.departments FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org leaders create departments" ON public.departments FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','hr_manager','finance_manager']::app_role[]));
CREATE POLICY "Org leaders update departments" ON public.departments FOR UPDATE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','hr_manager','finance_manager']::app_role[]) OR head_user_id = auth.uid());
CREATE POLICY "Org leaders delete departments" ON public.departments FOR DELETE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','hr_manager']::app_role[]));
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name text NOT NULL, description text DEFAULT '',
  manager_user_id uuid, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
CREATE INDEX IF NOT EXISTS idx_teams_dept ON public.teams(department_id);
CREATE INDEX IF NOT EXISTS idx_teams_org ON public.teams(organization_id);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view teams" ON public.teams FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Leaders create teams" ON public.teams FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','hr_manager','finance_manager']::app_role[]));
CREATE POLICY "Leaders update teams" ON public.teams FOR UPDATE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','hr_manager','finance_manager']::app_role[]) OR manager_user_id = auth.uid());
CREATE POLICY "Leaders delete teams" ON public.teams FOR DELETE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','hr_manager']::app_role[]));
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, user_id uuid NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  reports_to uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_code text, job_title text DEFAULT '',
  hire_date date, status text NOT NULL DEFAULT 'active',
  profile_completion int NOT NULL DEFAULT 0,
  emergency_contact jsonb DEFAULT '{}'::jsonb,
  banking jsonb DEFAULT '{}'::jsonb,
  insurance jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
CREATE INDEX IF NOT EXISTS idx_employees_org ON public.employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_team ON public.employees(team_id);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view employees" ON public.employees FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Leaders create employees" ON public.employees FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','hr_manager']::app_role[]));
CREATE POLICY "Self or leaders update employees" ON public.employees FOR UPDATE
  USING (auth.uid() = user_id OR public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','cfo','hr_manager','finance_manager','accounting_manager','team_manager']::app_role[]));
CREATE POLICY "Leaders delete employees" ON public.employees FOR DELETE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','hr_manager']::app_role[]));
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.collab_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'General',
  created_by UUID NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collab_threads TO authenticated;
GRANT ALL ON public.collab_threads TO service_role;
ALTER TABLE public.collab_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view threads" ON public.collab_threads FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Leaders create threads" ON public.collab_threads FOR INSERT
  WITH CHECK (auth.uid() = created_by AND public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','finance_manager','hr_manager','team_manager','accountant']::app_role[]));
CREATE POLICY "Leaders update threads" ON public.collab_threads FOR UPDATE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','finance_manager','hr_manager','team_manager']::app_role[]));
CREATE POLICY "Leaders delete threads" ON public.collab_threads FOR DELETE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','hr_manager']::app_role[]));
CREATE INDEX idx_collab_threads_org ON public.collab_threads(organization_id, last_message_at DESC);

CREATE TABLE public.collab_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.collab_threads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  body TEXT NOT NULL,
  mentions UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  client_nonce TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collab_messages TO authenticated;
GRANT ALL ON public.collab_messages TO service_role;
ALTER TABLE public.collab_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view messages" ON public.collab_messages FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org members send messages" ON public.collab_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Senders delete own messages" ON public.collab_messages FOR DELETE USING (auth.uid() = sender_id);
CREATE INDEX idx_collab_messages_thread ON public.collab_messages(thread_id, created_at);
CREATE INDEX idx_collab_messages_org ON public.collab_messages(organization_id, created_at DESC);
CREATE UNIQUE INDEX idx_collab_messages_nonce ON public.collab_messages(sender_id, client_nonce) WHERE client_nonce IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bump_thread_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.collab_threads SET last_message_at = NEW.created_at, updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bump_thread AFTER INSERT ON public.collab_messages FOR EACH ROW EXECUTE FUNCTION public.bump_thread_last_message();

CREATE TABLE public.collab_read_receipts (
  thread_id UUID NOT NULL REFERENCES public.collab_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collab_read_receipts TO authenticated;
GRANT ALL ON public.collab_read_receipts TO service_role;
ALTER TABLE public.collab_read_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own receipts" ON public.collab_read_receipts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users upsert own receipts" ON public.collab_read_receipts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own receipts" ON public.collab_read_receipts FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE public.voice_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL, created_by UUID NOT NULL,
  title TEXT NOT NULL, script TEXT NOT NULL DEFAULT '',
  audio_url TEXT, duration_seconds INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_briefings TO authenticated;
GRANT ALL ON public.voice_briefings TO service_role;
ALTER TABLE public.voice_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leaders create briefings" ON public.voice_briefings FOR INSERT
  WITH CHECK (auth.uid() = created_by AND public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','finance_manager','hr_manager','accounting_manager']::app_role[]));
CREATE POLICY "Leaders update briefings" ON public.voice_briefings FOR UPDATE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','finance_manager','hr_manager']::app_role[]));
CREATE POLICY "Leaders delete briefings" ON public.voice_briefings FOR DELETE
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','hr_manager']::app_role[]));
CREATE INDEX idx_voice_briefings_org ON public.voice_briefings(organization_id, created_at DESC);

CREATE TABLE public.voice_briefing_assignments (
  briefing_id UUID NOT NULL REFERENCES public.voice_briefings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (briefing_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_briefing_assignments TO authenticated;
GRANT ALL ON public.voice_briefing_assignments TO service_role;
ALTER TABLE public.voice_briefing_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.voice_briefing_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id UUID NOT NULL REFERENCES public.voice_briefings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_briefing_plays TO authenticated;
GRANT ALL ON public.voice_briefing_plays TO service_role;
ALTER TABLE public.voice_briefing_plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own plays" ON public.voice_briefing_plays FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own plays" ON public.voice_briefing_plays FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own plays" ON public.voice_briefing_plays FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX idx_voice_plays_user ON public.voice_briefing_plays(user_id, played_at DESC);
CREATE INDEX idx_voice_plays_briefing ON public.voice_briefing_plays(briefing_id, played_at DESC);

CREATE TRIGGER trg_collab_threads_updated BEFORE UPDATE ON public.collab_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_voice_briefings_updated BEFORE UPDATE ON public.voice_briefings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.collab_messages REPLICA IDENTITY FULL;
ALTER TABLE public.collab_threads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_threads;

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
CREATE POLICY "Org members view role permissions" ON public.role_permissions FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Owners/CEO manage role permissions" ON public.role_permissions FOR ALL
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner'::public.app_role, 'ceo'::public.app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner'::public.app_role, 'ceo'::public.app_role]));
CREATE TRIGGER trg_role_permissions_updated BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_role_permissions_org_module ON public.role_permissions (organization_id, module);

CREATE TABLE IF NOT EXISTS public.presence_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  channel text NOT NULL, event_type text NOT NULL,
  latency_ms integer, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.presence_telemetry TO authenticated;
GRANT ALL ON public.presence_telemetry TO service_role;
ALTER TABLE public.presence_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User inserts own telemetry" ON public.presence_telemetry FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "User views own telemetry" ON public.presence_telemetry FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Leaders view org telemetry" ON public.presence_telemetry FOR SELECT
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner'::public.app_role,'ceo'::public.app_role,'cfo'::public.app_role,'hr_manager'::public.app_role,'auditor'::public.app_role]));
CREATE INDEX IF NOT EXISTS idx_presence_telemetry_org_created ON public.presence_telemetry (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.permissions (
  key text PRIMARY KEY, module text NOT NULL, action text NOT NULL,
  label text NOT NULL, description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions readable to authenticated" ON public.permissions FOR SELECT TO authenticated USING (true);
INSERT INTO public.permissions (key, module, action, label, description) VALUES
  ('collaboration.view',    'collaboration',   'view',   'View Collaboration',       'See team threads and messages'),
  ('collaboration.manage',  'collaboration',   'manage', 'Manage Collaboration',     'Create threads, delete messages'),
  ('voice_briefings.view',  'voice_briefings', 'view',   'View Voice Briefings',     'Listen to briefings'),
  ('voice_briefings.manage','voice_briefings', 'manage', 'Manage Voice Briefings',   'Record and assign briefings'),
  ('roles.manage',          'admin',           'manage', 'Manage Roles & Permissions','Create roles, edit matrix, assign users'),
  ('audit.view',            'admin',           'view',   'View Audit Log',           'Read RBAC audit history')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL, name text NOT NULL, description text,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON public.custom_roles(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read roles" ON public.custom_roles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "admins insert roles" ON public.custom_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));
CREATE POLICY "admins update non-system roles" ON public.custom_roles FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]) AND is_system = false)
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]) AND is_system = false);
CREATE POLICY "admins delete non-system roles" ON public.custom_roles FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]) AND is_system = false);
CREATE TRIGGER trg_custom_roles_updated BEFORE UPDATE ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.custom_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_slug text NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role_slug, permission_key)
);
CREATE INDEX IF NOT EXISTS idx_crp_lookup ON public.custom_role_permissions(organization_id, role_slug);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_role_permissions TO authenticated;
GRANT ALL ON public.custom_role_permissions TO service_role;
ALTER TABLE public.custom_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read role permissions" ON public.custom_role_permissions FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "admins write role permissions" ON public.custom_role_permissions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));
CREATE TRIGGER trg_crp_updated BEFORE UPDATE ON public.custom_role_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.rbac_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text, event_type text NOT NULL,
  target_role text, target_user_id uuid,
  previous_value jsonb, new_value jsonb, metadata jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_org_time ON public.rbac_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_event ON public.rbac_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_actor ON public.rbac_audit_log(actor_user_id);
GRANT SELECT, INSERT ON public.rbac_audit_log TO authenticated;
GRANT ALL ON public.rbac_audit_log TO service_role;
ALTER TABLE public.rbac_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.rbac_audit_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));
CREATE POLICY "admins insert audit" ON public.rbac_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _org_id uuid, _perm_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _role text; _granted boolean;
BEGIN
  SELECT role::text INTO _role FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org_id LIMIT 1;
  IF _role IS NULL THEN RETURN false; END IF;
  IF _role = 'owner' THEN RETURN true; END IF;
  SELECT granted INTO _granted FROM public.custom_role_permissions WHERE organization_id = _org_id AND role_slug = _role AND permission_key = _perm_key LIMIT 1;
  IF FOUND THEN RETURN _granted; END IF;
  RETURN CASE _perm_key
    WHEN 'collaboration.view' THEN _role IN ('owner','ceo','cfo','finance_manager','accounting_manager','hr_manager','auditor','team_manager','accountant','analyst','employee')
    WHEN 'collaboration.manage' THEN _role IN ('owner','ceo','cfo','finance_manager','hr_manager','team_manager')
    WHEN 'voice_briefings.view' THEN _role IN ('owner','ceo','cfo','finance_manager','accounting_manager','hr_manager','auditor','team_manager','accountant','analyst','employee')
    WHEN 'voice_briefings.manage' THEN _role IN ('owner','ceo','cfo','finance_manager','hr_manager')
    WHEN 'roles.manage' THEN _role IN ('owner','ceo')
    WHEN 'audit.view' THEN _role IN ('owner','ceo')
    ELSE false
  END;
END $$;

CREATE OR REPLACE FUNCTION public.delete_custom_role(_org uuid, _slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_sys boolean;
BEGIN
  IF NOT public.has_any_role(auth.uid(), _org, ARRAY['owner','ceo']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT is_system INTO _is_sys FROM public.custom_roles WHERE organization_id = _org AND slug = _slug;
  IF _is_sys IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF _is_sys THEN RAISE EXCEPTION 'System roles cannot be deleted'; END IF;
  DELETE FROM public.custom_role_permissions WHERE organization_id = _org AND role_slug = _slug;
  DELETE FROM public.custom_roles WHERE organization_id = _org AND slug = _slug;
END $$;

CREATE OR REPLACE FUNCTION public.seed_system_roles(_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.custom_roles (organization_id, slug, name, description, is_system) VALUES
    (_org, 'owner',              'Owner',              'Full system access',           true),
    (_org, 'ceo',                'CEO',                'Executive leadership',         true),
    (_org, 'cfo',                'CFO',                'Chief financial officer',      true),
    (_org, 'finance_manager',    'Finance Manager',    'Finance department lead',      true),
    (_org, 'accounting_manager', 'Accounting Manager', 'Accounting lead',              true),
    (_org, 'hr_manager',         'HR Manager',         'Human resources lead',         true),
    (_org, 'auditor',            'Auditor',            'Read-only audit access',       true),
    (_org, 'team_manager',       'Team Manager',       'Team lead',                    true),
    (_org, 'accountant',         'Accountant',         'Accounting staff',             true),
    (_org, 'analyst',            'Analyst',            'Data analyst',                 true),
    (_org, 'employee',           'Employee',           'Standard employee',            true),
    (_org, 'viewer',             'Viewer',             'Read-only access',             true)
  ON CONFLICT (organization_id, slug) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_organization_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.seed_system_roles(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER trg_org_seed_roles AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization_roles();

DO $$ DECLARE r record;
BEGIN FOR r IN SELECT id FROM public.organizations LOOP PERFORM public.seed_system_roles(r.id); END LOOP; END $$;

-- ============= VOICE BRIEFINGS RECURSION FIX =============
CREATE OR REPLACE FUNCTION public.voice_briefing_has_assignments(_briefing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.voice_briefing_assignments WHERE briefing_id = _briefing_id)
$$;
CREATE OR REPLACE FUNCTION public.voice_briefing_is_assigned(_briefing_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.voice_briefing_assignments WHERE briefing_id = _briefing_id AND user_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION public.voice_briefing_org(_briefing_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.voice_briefings WHERE id = _briefing_id
$$;

CREATE POLICY "Org members view briefings" ON public.voice_briefings FOR SELECT
  USING (
    public.is_org_member(auth.uid(), organization_id) AND (
      auth.uid() = created_by
      OR public.has_any_role(auth.uid(), organization_id,
           ARRAY['owner'::public.app_role,'ceo'::public.app_role,'cfo'::public.app_role,'hr_manager'::public.app_role,'auditor'::public.app_role])
      OR NOT public.voice_briefing_has_assignments(id)
      OR public.voice_briefing_is_assigned(id, auth.uid())
    )
  );

CREATE POLICY "Org members view assignments" ON public.voice_briefing_assignments FOR SELECT
  USING (public.is_org_member(auth.uid(), public.voice_briefing_org(briefing_id)));
CREATE POLICY "Leaders insert assignments" ON public.voice_briefing_assignments FOR INSERT
  WITH CHECK (public.has_any_role(auth.uid(), public.voice_briefing_org(briefing_id),
    ARRAY['owner'::public.app_role,'ceo'::public.app_role,'cfo'::public.app_role,'hr_manager'::public.app_role]));
CREATE POLICY "Leaders update assignments" ON public.voice_briefing_assignments FOR UPDATE
  USING (public.has_any_role(auth.uid(), public.voice_briefing_org(briefing_id),
    ARRAY['owner'::public.app_role,'ceo'::public.app_role,'cfo'::public.app_role,'hr_manager'::public.app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), public.voice_briefing_org(briefing_id),
    ARRAY['owner'::public.app_role,'ceo'::public.app_role,'cfo'::public.app_role,'hr_manager'::public.app_role]));
CREATE POLICY "Leaders delete assignments" ON public.voice_briefing_assignments FOR DELETE
  USING (public.has_any_role(auth.uid(), public.voice_briefing_org(briefing_id),
    ARRAY['owner'::public.app_role,'ceo'::public.app_role,'cfo'::public.app_role,'hr_manager'::public.app_role]));

-- Voice briefings storage bucket policies (bucket created separately)
DROP POLICY IF EXISTS "Public read voice briefings" ON storage.objects;
CREATE POLICY "Public read voice briefings" ON storage.objects FOR SELECT USING (bucket_id = 'voice-briefings');
DROP POLICY IF EXISTS "Authenticated upload voice briefings" ON storage.objects;
CREATE POLICY "Authenticated upload voice briefings" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice-briefings' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Owner delete voice briefings" ON storage.objects;
CREATE POLICY "Owner delete voice briefings" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'voice-briefings' AND auth.uid()::text = (storage.foldername(name))[1]);