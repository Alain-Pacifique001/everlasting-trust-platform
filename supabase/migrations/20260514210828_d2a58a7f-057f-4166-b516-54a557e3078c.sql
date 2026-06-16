
-- Multi-tenancy
ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS organization_members_user_id_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_user_org_unique'
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_user_org_unique UNIQUE (user_id, organization_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.created_by, NEW.id, 'owner'::public.app_role)
  ON CONFLICT (user_id, organization_id) DO UPDATE
    SET role = 'owner'::public.app_role, updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_membership_request_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.organization_members (user_id, organization_id, role)
    VALUES (NEW.user_id, NEW.organization_id, 'employee'::public.app_role)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET updated_at = now();

    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.user_id, 'Membership approved',
      'Your request to join the organization was approved. Welcome aboard!', 'success', '/');
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (NEW.user_id, 'Membership request rejected',
      'Your request to join the organization was not approved.', 'warning');
  END IF;
  RETURN NEW;
END;
$$;

-- Helpers
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _org_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_active_org(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(((SELECT preferences FROM public.user_settings WHERE user_id = _user_id) ->> 'activeOrganizationId'), '')::uuid,
    (SELECT organization_id FROM public.organization_members WHERE user_id = _user_id ORDER BY created_at LIMIT 1)
  );
$$;

-- Departments
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  parent_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text DEFAULT '',
  head_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departments_org ON public.departments(organization_id);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view departments" ON public.departments;
CREATE POLICY "Org members view departments" ON public.departments
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Org leaders create departments" ON public.departments;
CREATE POLICY "Org leaders create departments" ON public.departments
  FOR INSERT WITH CHECK (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','cfo','hr_manager','finance_manager']::app_role[]));
DROP POLICY IF EXISTS "Org leaders update departments" ON public.departments;
CREATE POLICY "Org leaders update departments" ON public.departments
  FOR UPDATE USING (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','cfo','hr_manager','finance_manager']::app_role[])
    OR head_user_id = auth.uid());
DROP POLICY IF EXISTS "Org leaders delete departments" ON public.departments;
CREATE POLICY "Org leaders delete departments" ON public.departments
  FOR DELETE USING (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','hr_manager']::app_role[]));

DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Teams
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  manager_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teams_dept ON public.teams(department_id);
CREATE INDEX IF NOT EXISTS idx_teams_org ON public.teams(organization_id);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view teams" ON public.teams;
CREATE POLICY "Org members view teams" ON public.teams
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Leaders create teams" ON public.teams;
CREATE POLICY "Leaders create teams" ON public.teams
  FOR INSERT WITH CHECK (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','cfo','hr_manager','finance_manager']::app_role[]));
DROP POLICY IF EXISTS "Leaders update teams" ON public.teams;
CREATE POLICY "Leaders update teams" ON public.teams
  FOR UPDATE USING (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','cfo','hr_manager','finance_manager']::app_role[])
    OR manager_user_id = auth.uid());
DROP POLICY IF EXISTS "Leaders delete teams" ON public.teams;
CREATE POLICY "Leaders delete teams" ON public.teams
  FOR DELETE USING (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','hr_manager']::app_role[]));

DROP TRIGGER IF EXISTS trg_teams_updated_at ON public.teams;
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Employees
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  reports_to uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_code text,
  job_title text DEFAULT '',
  hire_date date,
  status text NOT NULL DEFAULT 'active',
  profile_completion int NOT NULL DEFAULT 0,
  emergency_contact jsonb DEFAULT '{}'::jsonb,
  banking jsonb DEFAULT '{}'::jsonb,
  insurance jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_employees_org ON public.employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_team ON public.employees(team_id);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view employees" ON public.employees;
CREATE POLICY "Org members view employees" ON public.employees
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Leaders create employees" ON public.employees;
CREATE POLICY "Leaders create employees" ON public.employees
  FOR INSERT WITH CHECK (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','hr_manager']::app_role[]));
DROP POLICY IF EXISTS "Self or leaders update employees" ON public.employees;
CREATE POLICY "Self or leaders update employees" ON public.employees
  FOR UPDATE USING (auth.uid() = user_id
    OR public.has_any_role(auth.uid(), organization_id,
        ARRAY['owner','ceo','cfo','hr_manager','finance_manager','accounting_manager','team_manager']::app_role[]));
DROP POLICY IF EXISTS "Leaders delete employees" ON public.employees;
CREATE POLICY "Leaders delete employees" ON public.employees
  FOR DELETE USING (public.has_any_role(auth.uid(), organization_id,
    ARRAY['owner','ceo','hr_manager']::app_role[]));

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
