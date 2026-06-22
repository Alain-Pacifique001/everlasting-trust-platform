// Bootstrap a default administrative account.
// Idempotent: if the user or org already exists, it does nothing.
// Logs the action in rbac_audit_log when a fresh account is provisioned.
//
// Public (verify_jwt = false) so it can be invoked during first-run initialization,
// but it has no inputs and only ever creates a single hard-coded admin account.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMINS: Array<{ email: string; password: string; full_name: string }> = [
  { email: "halaianpacifique@gmail.com", password: "mulpivot01..", full_name: "System Administrator" },
  { email: "halainpacifique@gmail.com", password: "mulpivot01..", full_name: "System Administrator" },
];
const ORG_NAME = "Savvy System";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    // 1. Look up profile by email to determine if user exists.
    const { data: existingProfile } = await svc
      .from("profiles")
      .select("user_id")
      .ilike("email", ADMIN_EMAIL)
      .maybeSingle();

    let userId = existingProfile?.user_id as string | undefined;
    let created = false;

    if (!userId) {
      // Create the auth user (email_confirm bypasses verification)
      const { data: createRes, error: createErr } = await svc.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "System Administrator" },
      });
      if (createErr || !createRes.user) {
        // If the user truly already exists in auth but not in profiles, list and find them
        const { data: list } = await svc.auth.admin.listUsers();
        const found = list?.users?.find((u: any) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
        if (!found) {
          return json(500, { error: createErr?.message ?? "Failed to create admin user" });
        }
        userId = found.id;
      } else {
        userId = createRes.user.id;
        created = true;
      }
    }

    // 2. Ensure a default organization exists owned by the admin.
    const { data: existingOrg } = await svc
      .from("organizations")
      .select("id,join_code")
      .eq("created_by", userId!)
      .eq("name", ORG_NAME)
      .maybeSingle();

    let orgId = existingOrg?.id as string | undefined;
    if (!orgId) {
      const { data: newOrg, error: orgErr } = await svc
        .from("organizations")
        .insert({ name: ORG_NAME, type: "company", created_by: userId! })
        .select("id,join_code")
        .single();
      if (orgErr || !newOrg) return json(500, { error: orgErr?.message ?? "Failed to create org" });
      orgId = newOrg.id;
    }

    // 3. Ensure owner membership (handle_new_organization trigger normally does this,
    //    but enforce idempotently in case the trigger was bypassed).
    await svc.from("organization_members").upsert(
      { user_id: userId!, organization_id: orgId!, role: "owner" },
      { onConflict: "user_id,organization_id" },
    );

    // 4. Audit log entry (only when freshly created to avoid spam).
    if (created) {
      await svc.from("rbac_audit_log").insert({
        organization_id: orgId,
        actor_user_id: userId,
        event_type: "system.bootstrap_admin_created",
        metadata: { email: ADMIN_EMAIL, org_name: ORG_NAME },
      });
    }

    const { data: org } = await svc
      .from("organizations")
      .select("id,name,join_code")
      .eq("id", orgId!)
      .single();

    return json(200, {
      ok: true,
      created,
      user_id: userId,
      organization: org,
    });
  } catch (err) {
    return json(500, { error: String((err as Error).message ?? err) });
  }
});
