import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COLUMNS = [
  "event_id", "user_id", "user_name", "email", "department", "role",
  "action_type", "module", "resource", "previous_value", "new_value",
  "ip_address", "device_info", "session_id", "timestamp", "status", "metadata",
] as const;

const csvEscape = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const {
      organization_id,
      from_date,
      to_date,
      user_id,
      role,
      module,
      action_type,
      job_id,
    } = body;

    if (!organization_id) return new Response(JSON.stringify({ error: "organization_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Authorization check: must be owner/ceo/auditor
    const { data: member } = await supabase.from("organization_members").select("role").eq("user_id", user.id).eq("organization_id", organization_id).maybeSingle();
    if (!member || !["owner", "ceo", "auditor"].includes(member.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update job to running
    if (job_id) await supabase.from("audit_export_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job_id);

    // Stream CSV: paginate rbac_audit_log + settings_audit_log, joined with profiles for name/email.
    const PAGE = 1000;
    let total = 0;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          controller.enqueue(enc.encode(COLUMNS.join(",") + "\n"));

          let offset = 0;
          for (;;) {
            let q = supabase
              .from("rbac_audit_log")
              .select("id, actor_user_id, actor_email, event_type, target_role, target_user_id, previous_value, new_value, metadata, ip_address, created_at")
              .eq("organization_id", organization_id)
              .order("created_at", { ascending: false })
              .range(offset, offset + PAGE - 1);
            if (from_date) q = q.gte("created_at", from_date);
            if (to_date) q = q.lte("created_at", to_date);
            if (user_id) q = q.eq("actor_user_id", user_id);
            if (role) q = q.eq("target_role", role);
            if (action_type) q = q.eq("event_type", action_type);

            const { data, error } = await q;
            if (error) throw error;
            if (!data || data.length === 0) break;

            // Batch fetch profiles for actor/user names
            const ids = Array.from(new Set(data.map((r) => r.actor_user_id).filter(Boolean))) as string[];
            const { data: profiles } = ids.length
              ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids)
              : { data: [] };
            const pmap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

            for (const r of data) {
              const p = pmap.get(r.actor_user_id);
              const row = [
                r.id,
                r.actor_user_id ?? "",
                p?.full_name ?? "",
                r.actor_email ?? p?.email ?? "",
                "", // department (not stored at audit time)
                r.target_role ?? "",
                r.event_type ?? "",
                "rbac",
                r.target_user_id ?? "",
                r.previous_value,
                r.new_value,
                r.ip_address ?? "",
                "",
                "",
                r.created_at,
                "ok",
                r.metadata,
              ];
              controller.enqueue(enc.encode(row.map(csvEscape).join(",") + "\n"));
              total++;
            }

            if (data.length < PAGE) break;
            offset += PAGE;
            if (offset > 1_000_000) break; // safety cap
          }

          if (job_id) {
            await supabase.from("audit_export_jobs").update({
              status: "completed",
              row_count: total,
              completed_at: new Date().toISOString(),
            }).eq("id", job_id);
          }
          controller.close();
        } catch (err) {
          if (job_id) {
            await supabase.from("audit_export_jobs").update({
              status: "failed",
              error: String((err as Error).message ?? err),
              completed_at: new Date().toISOString(),
            }).eq("id", job_id);
          }
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
