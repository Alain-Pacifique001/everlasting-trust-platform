CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.created_by, NEW.id, 'owner'::public.app_role)
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        role = 'owner'::public.app_role,
        updated_at = now();
  RETURN NEW;
END;
$function$;