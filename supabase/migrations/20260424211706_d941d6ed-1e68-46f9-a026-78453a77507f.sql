CREATE POLICY "Creators can view organizations they created"
ON public.organizations
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);