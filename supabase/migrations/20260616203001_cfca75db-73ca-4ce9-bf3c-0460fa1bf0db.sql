-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  notifications JSONB DEFAULT '{"emailAlerts":true,"pushNotifications":true,"budgetWarnings":true,"weeklyReport":false,"marketAlerts":true,"goalReminders":true}'::jsonb,
  preferences JSONB DEFAULT '{"dateFormat":"MM/DD/YYYY","startOfWeek":"monday","compactView":false,"showBalances":true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.holdings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, symbol TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  asset_type TEXT NOT NULL DEFAULT 'stock', shares NUMERIC NOT NULL DEFAULT 0,
  avg_price NUMERIC NOT NULL DEFAULT 0, notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO authenticated;
GRANT ALL ON public.holdings TO service_role;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own holdings" ON public.holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own holdings" ON public.holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own holdings" ON public.holdings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own holdings" ON public.holdings FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_holdings_updated_at BEFORE UPDATE ON public.holdings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, symbol TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  asset_type TEXT NOT NULL DEFAULT 'stock',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;
GRANT ALL ON public.watchlist TO service_role;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own watchlist" ON public.watchlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own watchlist" ON public.watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own watchlist" ON public.watchlist FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_holdings_user ON public.holdings(user_id);
CREATE INDEX idx_watchlist_user ON public.watchlist(user_id);

CREATE TABLE public.price_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, symbol TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  target_price NUMERIC NOT NULL, condition TEXT NOT NULL DEFAULT 'above',
  active BOOLEAN NOT NULL DEFAULT true, last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT ALL ON public.price_alerts TO service_role;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own alerts" ON public.price_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own alerts" ON public.price_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own alerts" ON public.price_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own alerts" ON public.price_alerts FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_price_alerts_updated_at BEFORE UPDATE ON public.price_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_price_alerts_user ON public.price_alerts(user_id);
CREATE INDEX idx_price_alerts_active ON public.price_alerts(active) WHERE active = true;

CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'info', link TEXT, read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can insert notifications" ON public.notifications FOR INSERT TO service_role WITH CHECK (true);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE read = false;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE TYPE public.app_role AS ENUM ('owner', 'accountant', 'analyst', 'viewer');

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'company',
  description TEXT DEFAULT '', created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);

CREATE OR REPLACE FUNCTION public.get_user_org(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _org_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org_id);
$$;

CREATE POLICY "Members view their organization" ON public.organizations FOR SELECT USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Creators can view organizations they created" ON public.organizations FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Authenticated users create organizations" ON public.organizations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners update their organization" ON public.organizations FOR UPDATE USING (public.has_role(auth.uid(), id, 'owner'));
CREATE POLICY "Owners delete their organization" ON public.organizations FOR DELETE USING (public.has_role(auth.uid(), id, 'owner'));

CREATE POLICY "Members view org membership" ON public.organization_members FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Users insert own membership" ON public.organization_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners manage memberships" ON public.organization_members FOR UPDATE USING (public.has_role(auth.uid(), organization_id, 'owner'));
CREATE POLICY "Owners remove members" ON public.organization_members FOR DELETE USING (public.has_role(auth.uid(), organization_id, 'owner') OR auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.created_by, NEW.id, 'owner'::public.app_role)
  ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'owner'::public.app_role, updated_at = now();
  RETURN NEW;
END $$;
CREATE TRIGGER on_organization_created AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  amount NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD',
  due_date DATE, status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID NOT NULL, created_by UUID NOT NULL, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_org ON public.tasks(organization_id);
CREATE INDEX idx_tasks_assignee ON public.tasks(assigned_to);
CREATE POLICY "Org members view tasks" ON public.tasks FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Owners and accountants create tasks" ON public.tasks FOR INSERT
  WITH CHECK (auth.uid() = created_by AND (public.has_role(auth.uid(), organization_id, 'owner') OR public.has_role(auth.uid(), organization_id, 'accountant')));
CREATE POLICY "Assignee or admins update tasks" ON public.tasks FOR UPDATE
  USING (auth.uid() = assigned_to OR public.has_role(auth.uid(), organization_id, 'owner') OR public.has_role(auth.uid(), organization_id, 'accountant'));
CREATE POLICY "Owners and accountants delete tasks" ON public.tasks FOR DELETE
  USING (public.has_role(auth.uid(), organization_id, 'owner') OR public.has_role(auth.uid(), organization_id, 'accountant'));
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_org_members_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.holdings ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.price_alerts ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.watchlist ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE POLICY "Org members view org holdings" ON public.holdings FOR SELECT USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org members view org alerts" ON public.price_alerts FOR SELECT USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org members view org watchlist" ON public.watchlist FOR SELECT USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));

CREATE TABLE IF NOT EXISTS public.settings_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, section text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings_audit_log TO authenticated;
GRANT ALL ON public.settings_audit_log TO service_role;
ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own audit log" ON public.settings_audit_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own audit log" ON public.settings_audit_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_settings_audit_log_user_created ON public.settings_audit_log (user_id, created_at DESC);

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS join_code text UNIQUE;
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := ''; i int;
BEGIN
  FOR i IN 1..8 LOOP result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1); END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.set_org_join_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate text; attempts int := 0;
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
END $$;
CREATE TRIGGER trg_set_org_join_code BEFORE INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_org_join_code();

CREATE TABLE IF NOT EXISTS public.membership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, status text NOT NULL DEFAULT 'pending',
  message text DEFAULT '', reviewed_by uuid, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_requests TO authenticated;
GRANT ALL ON public.membership_requests TO service_role;
CREATE INDEX IF NOT EXISTS idx_membership_requests_org ON public.membership_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_membership_requests_user ON public.membership_requests(user_id);

CREATE OR REPLACE FUNCTION public.validate_membership_request_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','rejected','cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_membership_request_status BEFORE INSERT OR UPDATE ON public.membership_requests FOR EACH ROW EXECUTE FUNCTION public.validate_membership_request_status();

ALTER TABLE public.membership_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users submit own membership request" ON public.membership_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own requests" ON public.membership_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Org admins view org requests" ON public.membership_requests FOR SELECT
  USING (public.has_role(auth.uid(), organization_id, 'owner'::app_role) OR public.has_role(auth.uid(), organization_id, 'accountant'::app_role));
CREATE POLICY "Users cancel own pending request" ON public.membership_requests FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Org admins review requests" ON public.membership_requests FOR UPDATE
  USING (public.has_role(auth.uid(), organization_id, 'owner'::app_role) OR public.has_role(auth.uid(), organization_id, 'accountant'::app_role));

CREATE OR REPLACE FUNCTION public.handle_membership_request_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.organization_members (user_id, organization_id, role)
    VALUES (NEW.user_id, NEW.organization_id, 'viewer'::public.app_role)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET updated_at = now();
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.user_id, 'Membership approved', 'Your request to join the organization was approved. Welcome aboard!', 'success', '/');
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (NEW.user_id, 'Membership request rejected', 'Your request to join the organization was not approved.', 'warning');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_membership_request_approval AFTER UPDATE ON public.membership_requests FOR EACH ROW EXECUTE FUNCTION public.handle_membership_request_approval();

CREATE OR REPLACE FUNCTION public.find_org_by_code(_code text)
RETURNS TABLE (id uuid, name text, type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, type FROM public.organizations WHERE join_code = upper(_code) LIMIT 1;
$$;

CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, code_hash text NOT NULL,
  used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mfa_recovery_codes TO authenticated;
GRANT ALL ON public.mfa_recovery_codes TO service_role;
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON public.mfa_recovery_codes(user_id);
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own recovery codes" ON public.mfa_recovery_codes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own recovery codes" ON public.mfa_recovery_codes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own recovery codes" ON public.mfa_recovery_codes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own recovery codes" ON public.mfa_recovery_codes FOR DELETE USING (auth.uid() = user_id);