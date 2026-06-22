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

  const results: any[] = [];
  try {
    // Ensure the shared organization exists (owned by the first admin successfully resolved).
    let sharedOrgId: string | undefined;
    let sharedOrgOwnerId: string | undefined;

    for (const admin of ADMINS) {
      try {
        // 1. Look up profile by email.
        const { data: existingProfile } = await svc
          .from("profiles")
          .select("user_id")
          .ilike("email", admin.email)
          .maybeSingle();

        let userId = existingProfile?.user_id as string | undefined;
        let created = false;
        let passwordReset = false;

        if (!userId) {
          const { data: createRes, error: createErr } = await svc.auth.admin.createUser({
            email: admin.email,
            password: admin.password,
            email_confirm: true,
            user_metadata: { full_name: admin.full_name },
          });
          if (createErr || !createRes?.user) {
            const { data: list } = await svc.auth.admin.listUsers();
            const found = list?.users?.find((u: any) => u.email?.toLowerCase() === admin.email.toLowerCase());
            if (!found) {
              results.push({ email: admin.email, ok: false, error: createErr?.message ?? "create failed" });
              continue;
            }
            userId = found.id;
          } else {
            userId = createRes.user.id;
            created = true;
          }
        }

        // Always reset password + confirm email so the documented credentials work.
        const { error: updErr } = await svc.auth.admin.updateUserById(userId!, {
          password: admin.password,
          email_confirm: true,
          user_metadata: { full_name: admin.full_name },
        });
        if (!updErr) passwordReset = true;

        // 2. Ensure shared organization exists.
        if (!sharedOrgId) {
          const { data: existingOrg } = await svc
            .from("organizations")
            .select("id,join_code,created_by")
            .eq("name", ORG_NAME)
            .maybeSingle();
          if (existingOrg) {
            sharedOrgId = existingOrg.id as string;
            sharedOrgOwnerId = existingOrg.created_by as string;
          } else {
            const { data: newOrg, error: orgErr } = await svc
              .from("organizations")
              .insert({ name: ORG_NAME, type: "company", created_by: userId! })
              .select("id,join_code")
              .single();
            if (orgErr || !newOrg) {
              results.push({ email: admin.email, ok: false, error: orgErr?.message ?? "org create failed" });
              continue;
            }
            sharedOrgId = newOrg.id;
            sharedOrgOwnerId = userId;
          }
        }

        // 3. Owner membership.
        await svc.from("organization_members").upsert(
          { user_id: userId!, organization_id: sharedOrgId!, role: "owner" },
          { onConflict: "user_id,organization_id" },
        );

        // 4. Audit log on first creation.
        if (created) {
          await svc.from("rbac_audit_log").insert({
            organization_id: sharedOrgId,
            actor_user_id: userId,
            event_type: "system.bootstrap_admin_created",
            metadata: { email: admin.email, org_name: ORG_NAME },
          });
        }

        results.push({ email: admin.email, ok: true, user_id: userId, created, password_reset: passwordReset });
      } catch (e) {
        results.push({ email: admin.email, ok: false, error: String((e as Error).message ?? e) });
      }
    }

    const { data: org } = sharedOrgId
      ? await svc.from("organizations").select("id,name,join_code").eq("id", sharedOrgId).single()
      : { data: null };

    return json(200, { ok: true, organization: org, admins: results });
  } catch (err) {
    return json(500, { error: String((err as Error).message ?? err), partial: results });
  }
});
