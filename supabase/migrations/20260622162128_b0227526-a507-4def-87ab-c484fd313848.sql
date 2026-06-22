
-- EXPENSES
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_org_date_idx ON public.expenses (organization_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view org expenses" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Editors insert org expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
    AND user_id = auth.uid()
  );
CREATE POLICY "Editors update org expenses" ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
  );
CREATE POLICY "Editors delete org expenses" ON public.expenses FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
  );
CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- BUDGETS
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  category text NOT NULL,
  amount_limit numeric(14,2) NOT NULL,
  spent numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX budgets_org_idx ON public.budgets (organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view org budgets" ON public.budgets FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Editors insert org budgets" ON public.budgets FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
    AND user_id = auth.uid()
  );
CREATE POLICY "Editors update org budgets" ON public.budgets FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
  );
CREATE POLICY "Editors delete org budgets" ON public.budgets FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
  );
CREATE TRIGGER budgets_set_updated_at BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SAVINGS GOALS
CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  target_amount numeric(14,2) NOT NULL,
  saved_amount numeric(14,2) NOT NULL DEFAULT 0,
  icon text NOT NULL DEFAULT '🎯',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX savings_goals_org_idx ON public.savings_goals (organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view org savings" ON public.savings_goals FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Editors insert org savings" ON public.savings_goals FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
    AND user_id = auth.uid()
  );
CREATE POLICY "Editors update org savings" ON public.savings_goals FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
  );
CREATE POLICY "Editors delete org savings" ON public.savings_goals FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND NOT public.has_any_role(auth.uid(), organization_id, ARRAY['viewer','auditor']::public.app_role[])
  );
CREATE TRIGGER savings_goals_set_updated_at BEFORE UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
