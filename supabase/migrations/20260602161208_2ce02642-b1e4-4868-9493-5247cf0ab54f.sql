
-- ============ COLLABORATION ============
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
CREATE POLICY "Org members view threads" ON public.collab_threads FOR SELECT USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Leaders create threads" ON public.collab_threads FOR INSERT
  WITH CHECK (auth.uid() = created_by AND has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','finance_manager','hr_manager','team_manager','accountant']::app_role[]));
CREATE POLICY "Leaders update threads" ON public.collab_threads FOR UPDATE
  USING (has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','finance_manager','hr_manager','team_manager']::app_role[]));
CREATE POLICY "Leaders delete threads" ON public.collab_threads FOR DELETE
  USING (has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','hr_manager']::app_role[]));
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
CREATE POLICY "Org members view messages" ON public.collab_messages FOR SELECT USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org members send messages" ON public.collab_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND is_org_member(auth.uid(), organization_id));
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
CREATE TRIGGER trg_bump_thread AFTER INSERT ON public.collab_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_last_message();

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

-- ============ VOICE BRIEFINGS ============
CREATE TABLE public.voice_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  script TEXT NOT NULL DEFAULT '',
  audio_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_briefings TO authenticated;
GRANT ALL ON public.voice_briefings TO service_role;
ALTER TABLE public.voice_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view briefings" ON public.voice_briefings FOR SELECT USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Leaders create briefings" ON public.voice_briefings FOR INSERT
  WITH CHECK (auth.uid() = created_by AND has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','finance_manager','hr_manager','accounting_manager']::app_role[]));
CREATE POLICY "Leaders update briefings" ON public.voice_briefings FOR UPDATE
  USING (has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','cfo','finance_manager','hr_manager']::app_role[]));
CREATE POLICY "Leaders delete briefings" ON public.voice_briefings FOR DELETE
  USING (has_any_role(auth.uid(), organization_id, ARRAY['owner','ceo','hr_manager']::app_role[]));
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
CREATE POLICY "Org members view assignments" ON public.voice_briefing_assignments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.voice_briefings b WHERE b.id = briefing_id AND is_org_member(auth.uid(), b.organization_id)));
CREATE POLICY "Leaders manage assignments" ON public.voice_briefing_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.voice_briefings b WHERE b.id = briefing_id AND has_any_role(auth.uid(), b.organization_id, ARRAY['owner','ceo','cfo','hr_manager']::app_role[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.voice_briefings b WHERE b.id = briefing_id AND has_any_role(auth.uid(), b.organization_id, ARRAY['owner','ceo','cfo','hr_manager']::app_role[])));

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

-- timestamp triggers
CREATE TRIGGER trg_collab_threads_updated BEFORE UPDATE ON public.collab_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_voice_briefings_updated BEFORE UPDATE ON public.voice_briefings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- realtime
ALTER TABLE public.collab_messages REPLICA IDENTITY FULL;
ALTER TABLE public.collab_threads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_threads;
