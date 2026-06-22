CREATE POLICY "Org admins can view requesters profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.membership_requests mr
    WHERE mr.user_id = profiles.user_id
      AND public.has_any_role(auth.uid(), mr.organization_id, ARRAY['owner','ceo','accountant']::public.app_role[])
  )
  OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = profiles.user_id
      AND public.has_any_role(auth.uid(), om.organization_id, ARRAY['owner','ceo']::public.app_role[])
  )
);