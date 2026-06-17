
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ SIGNUP ROLE CONFIGS ============
CREATE TABLE public.signup_role_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  label text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT true,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  max_users integer,
  current_user_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role, department_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_role_configs TO authenticated;
GRANT ALL ON public.signup_role_configs TO service_role;
GRANT SELECT ON public.signup_role_configs TO anon;
ALTER TABLE public.signup_role_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active signup roles" ON public.signup_role_configs FOR SELECT USING (is_active = true);
CREATE POLICY "Org admins manage signup roles" ON public.signup_role_configs FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));
CREATE INDEX idx_signup_role_configs_org ON public.signup_role_configs(organization_id, is_active);
CREATE TRIGGER trg_signup_role_configs_updated BEFORE UPDATE ON public.signup_role_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ROLE REQUESTS ============
CREATE TABLE public.role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_role public.app_role NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note text,
  reviewed_at timestamptz,
  signup_config_id uuid REFERENCES public.signup_role_configs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_requests_status_chk CHECK (status IN ('pending','approved','rejected','cancelled'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_requests TO authenticated;
GRANT ALL ON public.role_requests TO service_role;
ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own role requests" ON public.role_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Org admins view org role requests" ON public.role_requests FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));
CREATE POLICY "Users create own role requests" ON public.role_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND requested_role <> 'owner'::public.app_role);
CREATE POLICY "Users cancel own pending requests" ON public.role_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status IN ('pending','cancelled'));
CREATE POLICY "Org admins manage role requests" ON public.role_requests FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));
CREATE INDEX idx_role_requests_user ON public.role_requests(user_id);
CREATE INDEX idx_role_requests_org_status ON public.role_requests(organization_id, status);
CREATE TRIGGER trg_role_requests_updated BEFORE UPDATE ON public.role_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ROLE CHANGE HISTORY ============
CREATE TABLE public.role_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  previous_role public.app_role,
  new_role public.app_role,
  action text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_change_history_action_chk CHECK (action IN ('granted','revoked','changed','requested','approved','rejected'))
);
GRANT SELECT, INSERT ON public.role_change_history TO authenticated;
GRANT ALL ON public.role_change_history TO service_role;
ALTER TABLE public.role_change_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own role history" ON public.role_change_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Org admins view all role history" ON public.role_change_history FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));
CREATE POLICY "Admins insert history" ON public.role_change_history FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo']::public.app_role[]));
CREATE INDEX idx_role_history_user ON public.role_change_history(user_id, created_at DESC);
CREATE INDEX idx_role_history_org ON public.role_change_history(organization_id, created_at DESC);

-- Trigger: approve/reject role_request -> grant membership + history + notification
CREATE OR REPLACE FUNCTION public.handle_role_request_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prev public.app_role;
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    SELECT role INTO _prev FROM public.organization_members
      WHERE user_id = NEW.user_id AND organization_id = NEW.organization_id;
    INSERT INTO public.organization_members (user_id, organization_id, role)
    VALUES (NEW.user_id, NEW.organization_id, NEW.requested_role)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();
    INSERT INTO public.role_change_history (user_id, organization_id, previous_role, new_role, action, changed_by, reason, source)
    VALUES (NEW.user_id, NEW.organization_id, _prev, NEW.requested_role, 'approved', NEW.reviewer_id, NEW.reviewer_note, 'role_request');
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.user_id, 'Role approved', 'Your role request was approved: ' || NEW.requested_role::text, 'success', '/settings');
    IF NEW.signup_config_id IS NOT NULL THEN
      UPDATE public.signup_role_configs SET current_user_count = current_user_count + 1 WHERE id = NEW.signup_config_id;
    END IF;
    NEW.reviewed_at := now();
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    INSERT INTO public.role_change_history (user_id, organization_id, new_role, action, changed_by, reason, source)
    VALUES (NEW.user_id, NEW.organization_id, NEW.requested_role, 'rejected', NEW.reviewer_id, NEW.reviewer_note, 'role_request');
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.user_id, 'Role request rejected', COALESCE(NEW.reviewer_note,'Your role request was not approved.'), 'warning', '/settings');
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_role_request_decision BEFORE UPDATE ON public.role_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_role_request_decision();

-- ============ AI CONVERSATIONS ============
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  model text,
  system_prompt text,
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  last_message_at timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  total_input_tokens integer NOT NULL DEFAULT 0,
  total_output_tokens integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own conversations" ON public.ai_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_ai_conv_user ON public.ai_conversations(user_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_ai_conv_org ON public.ai_conversations(organization_id);
CREATE INDEX idx_ai_conv_pinned ON public.ai_conversations(user_id, pinned) WHERE pinned = true;
CREATE INDEX idx_ai_conv_active ON public.ai_conversations(user_id) WHERE deleted_at IS NULL AND archived = false;
CREATE INDEX idx_ai_conv_title_trgm ON public.ai_conversations USING gin (title gin_trgm_ops);
CREATE TRIGGER trg_ai_conv_updated BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AI MESSAGES ============
CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  input_tokens integer,
  output_tokens integer,
  message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_role_chk CHECK (role IN ('system','user','assistant','tool'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages own messages" ON public.ai_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_ai_messages_conv ON public.ai_messages(conversation_id, created_at);

CREATE OR REPLACE FUNCTION public.bump_ai_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ai_conversations SET
    last_message_at = NEW.created_at,
    message_count = message_count + 1,
    total_input_tokens = total_input_tokens + COALESCE(NEW.input_tokens,0),
    total_output_tokens = total_output_tokens + COALESCE(NEW.output_tokens,0),
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bump_ai_conv AFTER INSERT ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_ai_conversation();

-- ============ AI PARTICIPANTS ============
CREATE OR REPLACE FUNCTION public.ai_conversation_owner(_conv uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.ai_conversations WHERE id = _conv
$$;

CREATE TABLE public.ai_conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'viewer',
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id),
  CONSTRAINT ai_part_perm_chk CHECK (permission IN ('owner','editor','viewer'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_participants TO authenticated;
GRANT ALL ON public.ai_conversation_participants TO service_role;
ALTER TABLE public.ai_conversation_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conv owner manages participants" ON public.ai_conversation_participants FOR ALL TO authenticated
  USING (public.ai_conversation_owner(conversation_id) = auth.uid())
  WITH CHECK (public.ai_conversation_owner(conversation_id) = auth.uid());
CREATE POLICY "Participants view their row" ON public.ai_conversation_participants FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============ AI TAGS ============
CREATE TABLE public.ai_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_tags TO authenticated;
GRANT ALL ON public.ai_conversation_tags TO service_role;
ALTER TABLE public.ai_conversation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conv owner manages tags" ON public.ai_conversation_tags FOR ALL TO authenticated
  USING (public.ai_conversation_owner(conversation_id) = auth.uid())
  WITH CHECK (public.ai_conversation_owner(conversation_id) = auth.uid());
CREATE INDEX idx_ai_tags_conv ON public.ai_conversation_tags(conversation_id);
CREATE INDEX idx_ai_tags_tag ON public.ai_conversation_tags(tag);

-- ============ AI AUDIT LOGS ============
CREATE TABLE public.ai_conversation_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_conversation_audit_logs TO authenticated;
GRANT ALL ON public.ai_conversation_audit_logs TO service_role;
ALTER TABLE public.ai_conversation_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conv owner views audits" ON public.ai_conversation_audit_logs FOR SELECT TO authenticated
  USING (public.ai_conversation_owner(conversation_id) = auth.uid());
CREATE POLICY "Actor inserts audit" ON public.ai_conversation_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);
CREATE INDEX idx_ai_audit_conv ON public.ai_conversation_audit_logs(conversation_id, created_at DESC);

-- ============ AUDIT EXPORT JOBS ============
CREATE TABLE public.audit_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  template text,
  status text NOT NULL DEFAULT 'queued',
  row_count integer,
  file_path text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  downloaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_export_jobs_status_chk CHECK (status IN ('queued','running','completed','failed','cancelled'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_export_jobs TO authenticated;
GRANT ALL ON public.audit_export_jobs TO service_role;
ALTER TABLE public.audit_export_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org auditors manage export jobs" ON public.audit_export_jobs FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','auditor']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','auditor']::public.app_role[]));
CREATE INDEX idx_export_jobs_org ON public.audit_export_jobs(organization_id, created_at DESC);
CREATE TRIGGER trg_export_jobs_updated BEFORE UPDATE ON public.audit_export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
