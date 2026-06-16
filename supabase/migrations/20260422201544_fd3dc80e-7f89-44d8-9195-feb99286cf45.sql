
-- 1. Role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'accountant', 'analyst', 'viewer');

-- 2. Organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'company',
  description TEXT DEFAULT '',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 3. Organization members (single-org per user enforced by UNIQUE user_id)
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);

-- 4. Security-definer helpers (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_org(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _org_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
  );
$$;

-- 5. RLS: organizations
CREATE POLICY "Members view their organization"
ON public.organizations FOR SELECT
USING (public.is_org_member(auth.uid(), id));

CREATE POLICY "Authenticated users create organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners update their organization"
ON public.organizations FOR UPDATE
USING (public.has_role(auth.uid(), id, 'owner'));

CREATE POLICY "Owners delete their organization"
ON public.organizations FOR DELETE
USING (public.has_role(auth.uid(), id, 'owner'));

-- 6. RLS: organization_members
CREATE POLICY "Members view org membership"
ON public.organization_members FOR SELECT
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users insert own membership"
ON public.organization_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners manage memberships"
ON public.organization_members FOR UPDATE
USING (public.has_role(auth.uid(), organization_id, 'owner'));

CREATE POLICY "Owners remove members"
ON public.organization_members FOR DELETE
USING (public.has_role(auth.uid(), organization_id, 'owner') OR auth.uid() = user_id);

-- 7. Auto-assign creator as owner
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.created_by, NEW.id, 'owner')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_organization_created
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

-- 8. Tasks table (financial tasks)
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID NOT NULL,
  created_by UUID NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_org ON public.tasks(organization_id);
CREATE INDEX idx_tasks_assignee ON public.tasks(assigned_to);

-- RLS: tasks (org members view; assignee can update own; admins manage all)
CREATE POLICY "Org members view tasks"
ON public.tasks FOR SELECT
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Owners and accountants create tasks"
ON public.tasks FOR INSERT
WITH CHECK (
  auth.uid() = created_by AND (
    public.has_role(auth.uid(), organization_id, 'owner') OR
    public.has_role(auth.uid(), organization_id, 'accountant')
  )
);

CREATE POLICY "Assignee or admins update tasks"
ON public.tasks FOR UPDATE
USING (
  auth.uid() = assigned_to OR
  public.has_role(auth.uid(), organization_id, 'owner') OR
  public.has_role(auth.uid(), organization_id, 'accountant')
);

CREATE POLICY "Owners and accountants delete tasks"
ON public.tasks FOR DELETE
USING (
  public.has_role(auth.uid(), organization_id, 'owner') OR
  public.has_role(auth.uid(), organization_id, 'accountant')
);

CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_org_members_updated_at
BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Scope existing financial tables to organization (nullable for backwards compat)
ALTER TABLE public.holdings ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.price_alerts ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.watchlist ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Add org-scoped SELECT policies (additive — own-data policies remain)
CREATE POLICY "Org members view org holdings"
ON public.holdings FOR SELECT
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members view org alerts"
ON public.price_alerts FOR SELECT
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members view org watchlist"
ON public.watchlist FOR SELECT
USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
