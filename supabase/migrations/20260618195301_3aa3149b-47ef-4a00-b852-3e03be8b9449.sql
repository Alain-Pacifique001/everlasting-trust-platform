-- Storage policies for audit-exports bucket
DROP POLICY IF EXISTS "Auditors read own org exports" ON storage.objects;
CREATE POLICY "Auditors read own org exports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'audit-exports'
  AND EXISTS (
    SELECT 1
    FROM public.audit_export_jobs j
    WHERE j.file_path = storage.objects.name
      AND public.has_any_role(auth.uid(), j.organization_id, ARRAY['owner','ceo','auditor']::public.app_role[])
  )
);

-- ===================== AI conversation sharing =====================
CREATE OR REPLACE FUNCTION public.ai_conversation_can_view(_conv uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ai_conversations c WHERE c.id = _conv AND c.user_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.ai_conversation_participants p
    WHERE p.conversation_id = _conv AND p.user_id = _user
  )
$$;

CREATE OR REPLACE FUNCTION public.ai_conversation_can_edit(_conv uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ai_conversations c WHERE c.id = _conv AND c.user_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.ai_conversation_participants p
    WHERE p.conversation_id = _conv AND p.user_id = _user AND p.permission IN ('owner','editor')
  )
$$;

DROP POLICY IF EXISTS "Owner manages own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "View own or shared conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Insert own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Owner updates conversation" ON public.ai_conversations;
DROP POLICY IF EXISTS "Owner deletes conversation" ON public.ai_conversations;

CREATE POLICY "View own or shared conversations"
ON public.ai_conversations FOR SELECT TO authenticated
USING (public.ai_conversation_can_view(id, auth.uid()));
CREATE POLICY "Insert own conversations"
ON public.ai_conversations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner updates conversation"
ON public.ai_conversations FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner deletes conversation"
ON public.ai_conversations FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner manages own messages" ON public.ai_messages;
DROP POLICY IF EXISTS "View messages of accessible conversation" ON public.ai_messages;
DROP POLICY IF EXISTS "Insert messages if editor" ON public.ai_messages;
DROP POLICY IF EXISTS "Owner manages messages" ON public.ai_messages;
DROP POLICY IF EXISTS "Owner updates messages" ON public.ai_messages;
DROP POLICY IF EXISTS "Owner deletes messages" ON public.ai_messages;

CREATE POLICY "View messages of accessible conversation"
ON public.ai_messages FOR SELECT TO authenticated
USING (public.ai_conversation_can_view(conversation_id, auth.uid()));
CREATE POLICY "Insert messages if editor"
ON public.ai_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.ai_conversation_can_edit(conversation_id, auth.uid())
);
CREATE POLICY "Owner updates messages"
ON public.ai_messages FOR UPDATE TO authenticated
USING (public.ai_conversation_owner(conversation_id) = auth.uid())
WITH CHECK (public.ai_conversation_owner(conversation_id) = auth.uid());
CREATE POLICY "Owner deletes messages"
ON public.ai_messages FOR DELETE TO authenticated
USING (public.ai_conversation_owner(conversation_id) = auth.uid());

-- ===================== Email -> user lookup =====================
CREATE OR REPLACE FUNCTION public.find_user_by_email(_email text)
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.full_name, p.email
  FROM public.profiles p
  WHERE lower(p.email) = lower(trim(_email))
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_conversation_can_view(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_conversation_can_edit(uuid, uuid) TO authenticated;