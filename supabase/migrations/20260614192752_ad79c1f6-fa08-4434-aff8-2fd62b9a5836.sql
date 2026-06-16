
-- =========================================================
-- 1. PERMISSIONS CATALOG (global, read-only to clients)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.permissions (
  key text PRIMARY KEY,
  module text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions readable to authenticated"
  ON public.permissions FOR SELECT TO authenticated USING (true);

INSERT INTO public.permissions (key, module, action, label, description) VALUES
  ('collaboration.view',    'collaboration',   'view',   'View Collaboration',       'See team threads and messages'),
  ('collaboration.manage',  'collaboration',   'manage', 'Manage Collaboration',     'Create threads, delete messages'),
  ('voice_briefings.view',  'voice_briefings', 'view',   'View Voice Briefings',     'Listen to briefings'),
  ('voice_briefings.manage','voice_briefings', 'manage', 'Manage Voice Briefings',   'Record and assign briefings'),
  ('roles.manage',          'admin',           'manage', 'Manage Roles & Permissions','Create roles, edit matrix, assign users'),
  ('audit.view',            'admin',           'view',   'View Audit Log',           'Read RBAC audit history')
ON CONFLICT (key) DO NOTHING;

-- =========================================================
-- 2. CUSTOM ROLES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
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

CREATE POLICY "members read roles"
  ON public.custom_roles FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "admins insert roles"
  ON public.custom_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));

CREATE POLICY "admins update non-system roles"
  ON public.custom_roles FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]) AND is_system = false)
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]) AND is_system = false);

CREATE POLICY "admins delete non-system roles"
  ON public.custom_roles FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]) AND is_system = false);

CREATE TRIGGER trg_custom_roles_updated
  BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3. CUSTOM ROLE PERMISSIONS
-- =========================================================
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

CREATE POLICY "members read role permissions"
  ON public.custom_role_permissions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "admins write role permissions"
  ON public.custom_role_permissions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));

CREATE TRIGGER trg_crp_updated
  BEFORE UPDATE ON public.custom_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4. RBAC AUDIT LOG
-- =========================================================
CREATE TABLE IF NOT EXISTS public.rbac_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  event_type text NOT NULL,
  target_role text,
  target_user_id uuid,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_org_time ON public.rbac_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_event ON public.rbac_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_actor ON public.rbac_audit_log(actor_user_id);

GRANT SELECT, INSERT ON public.rbac_audit_log TO authenticated;
GRANT ALL ON public.rbac_audit_log TO service_role;
ALTER TABLE public.rbac_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit"
  ON public.rbac_audit_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));

CREATE POLICY "admins insert audit"
  ON public.rbac_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));

-- =========================================================
-- 5. HELPER FUNCTIONS
-- =========================================================

-- Permission resolution: explicit custom_role_permissions wins; fallback to defaults
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _org_id uuid, _perm_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
  _granted boolean;
BEGIN
  SELECT role::text INTO _role
  FROM public.organization_members
  WHERE user_id = _user_id AND organization_id = _org_id
  LIMIT 1;

  IF _role IS NULL THEN RETURN false; END IF;
  IF _role = 'owner' THEN RETURN true; END IF;

  SELECT granted INTO _granted
  FROM public.custom_role_permissions
  WHERE organization_id = _org_id AND role_slug = _role AND permission_key = _perm_key
  LIMIT 1;

  IF FOUND THEN RETURN _granted; END IF;

  -- Default fallback mirroring useModuleAccess defaults
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

-- Safe delete: refuses system roles or roles in use
CREATE OR REPLACE FUNCTION public.delete_custom_role(_org uuid, _slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_sys boolean;
  _in_use int;
BEGIN
  IF NOT public.has_any_role(auth.uid(), _org, ARRAY['owner','ceo']::public.app_role[]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT is_system INTO _is_sys FROM public.custom_roles WHERE organization_id = _org AND slug = _slug;
  IF _is_sys IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF _is_sys THEN RAISE EXCEPTION 'System roles cannot be deleted'; END IF;

  -- Custom slugs that don't map to app_role enum can't be in organization_members, so safe.
  DELETE FROM public.custom_role_permissions WHERE organization_id = _org AND role_slug = _slug;
  DELETE FROM public.custom_roles WHERE organization_id = _org AND slug = _slug;
END $$;

-- Seed system roles for an organization
CREATE OR REPLACE FUNCTION public.seed_system_roles(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- Trigger: seed system roles when an organization is created
CREATE OR REPLACE FUNCTION public.handle_new_organization_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_system_roles(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_org_seed_roles ON public.organizations;
CREATE TRIGGER trg_org_seed_roles
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization_roles();

-- Backfill existing orgs
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_system_roles(r.id);
  END LOOP;
END $$;
