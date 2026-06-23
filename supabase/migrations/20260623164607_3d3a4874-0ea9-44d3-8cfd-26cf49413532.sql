
-- 1) Function to rotate all join codes uniquely
CREATE OR REPLACE FUNCTION public.rotate_all_join_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org RECORD;
  candidate text;
  attempts int;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    attempts := 0;
    LOOP
      candidate := public.generate_join_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE join_code = candidate);
      attempts := attempts + 1;
      EXIT WHEN attempts > 10;
    END LOOP;
    UPDATE public.organizations
      SET join_code = candidate, updated_at = now()
      WHERE id = org.id;
  END LOOP;
END $$;

-- 2) Enable pg_cron and schedule the rotation every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('rotate-join-codes-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'rotate-join-codes-5min',
  '*/5 * * * *',
  $$SELECT public.rotate_all_join_codes();$$
);

-- 3) Contact messages table for ideas / support submissions from the public landing page
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  category text NOT NULL CHECK (category IN ('idea','support','other')),
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.contact_messages TO anon;
GRANT INSERT ON public.contact_messages TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. unauthenticated visitors) can submit a contact message
CREATE POLICY "Anyone can submit a contact message"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(trim(name)) BETWEEN 1 AND 120
  AND char_length(trim(email)) BETWEEN 3 AND 200
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND char_length(trim(message)) BETWEEN 1 AND 4000
);

-- Only owners/ceos of any organization can view/manage contact messages
CREATE POLICY "Org admins can view contact messages"
ON public.contact_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.role IN ('owner','ceo')
  )
);

CREATE POLICY "Org admins can update contact messages"
ON public.contact_messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.role IN ('owner','ceo')
  )
);

CREATE TRIGGER update_contact_messages_updated_at
BEFORE UPDATE ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
