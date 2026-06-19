// Audit log CSV export — supports two modes:
//   mode = "queue"    -> creates a job, processes in the background, uploads to storage, updates job row.
//   mode = "download" -> streams CSV directly to the response (synchronous).
//
// Authorization: requires Owner, CEO, or Auditor of the target organization.
// Returns 401 if the JWT is invalid, 403 if the user lacks the role, 400 on bad input.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const COLUMNS = [
  "event_id", "user_id", "user_name", "email", "department", "role",
  "action_type", "module", "resource", "previous_value", "new_value",
  "ip_address", "device_info", "session_id", "timestamp", "status", "metadata",
] as const;

const csvEscape = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Filters = {
  organization_id: string;
  from_date?: string;
  to_date?: string;
  user_id?: string;
  role?: string;
  module?: string;
  action_type?: string;
};

type ValidationOk =
  | { ok: true; mode: "queue" | "download"; data: Filters }
  | { ok: true; mode: "cancel"; organization_id: string; job_id: string; reason?: string };

const validate = (body: any): ValidationOk | { ok: false; error: string } => {
  if (!body || typeof body !== "object") return { ok: false, error: "Body required" };
  const { organization_id, mode } = body;
  if (typeof organization_id !== "string" || !UUID.test(organization_id)) return { ok: false, error: "Invalid organization_id" };

  if (mode === "cancel") {
    const job_id = body.job_id;
    if (typeof job_id !== "string" || !UUID.test(job_id)) return { ok: false, error: "Invalid job_id" };
    const reason = typeof body.reason === "string" ? String(body.reason).slice(0, 500) : undefined;
    return { ok: true, mode: "cancel", organization_id, job_id, reason };
  }

  const { from_date, to_date, user_id, role, module, action_type } = body;
  if (from_date && !ISO.test(String(from_date))) return { ok: false, error: "Invalid from_date" };
  if (to_date && !ISO.test(String(to_date))) return { ok: false, error: "Invalid to_date" };
  if (user_id && !UUID.test(String(user_id))) return { ok: false, error: "Invalid user_id" };
  for (const [k, v] of Object.entries({ role, module, action_type })) {
    if (v !== undefined && (typeof v !== "string" || v.length > 64)) return { ok: false, error: `Invalid ${k}` };
  }
  const m = mode === "download" ? "download" : "queue";
  return { ok: true, mode: m, data: { organization_id, from_date, to_date, user_id, role, module, action_type } };
};

async function isCancelRequested(svc: any, jobId: string): Promise<boolean> {
  const { data } = await svc.from("audit_export_jobs").select("status,cancellation_requested_at").eq("id", jobId).maybeSingle();
  return !!data && (data.status === "cancelled" || data.cancellation_requested_at != null);
}

async function* fetchRowsInBatches(svc: any, f: Filters) {
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    let q = svc
      .from("rbac_audit_log")
      .select(
        "id, actor_user_id, actor_email, event_type, target_role, target_user_id, previous_value, new_value, metadata, ip_address, created_at",
      )
      .eq("organization_id", f.organization_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (f.from_date) q = q.gte("created_at", f.from_date);
    if (f.to_date) q = q.lte("created_at", f.to_date);
    if (f.user_id) q = q.eq("actor_user_id", f.user_id);
    if (f.role) q = q.eq("target_role", f.role);
    if (f.action_type) q = q.eq("event_type", f.action_type);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) return;
    const ids = Array.from(new Set(data.map((r: any) => r.actor_user_id).filter(Boolean))) as string[];
    const { data: profiles } = ids.length
      ? await svc.from("profiles").select("user_id, full_name, email").in("user_id", ids)
      : { data: [] };
    const pmap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    yield { rows: data, profiles: pmap };
    if (data.length < PAGE) return;
    offset += PAGE;
    if (offset > 1_000_000) return; // safety cap
  }
}

const rowToCsv = (r: any, p: any): string =>
  [
    r.id, r.actor_user_id ?? "", p?.full_name ?? "", r.actor_email ?? p?.email ?? "",
    "", r.target_role ?? "", r.event_type ?? "", "rbac",
    r.target_user_id ?? "", r.previous_value, r.new_value,
    r.ip_address ?? "", "", "", r.created_at, "ok", r.metadata,
  ].map(csvEscape).join(",");

async function buildAndUpload(svc: any, jobId: string, f: Filters): Promise<void> {
  await svc.from("audit_export_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", jobId);
  try {
    let total = 0;
    const lines: string[] = [COLUMNS.join(",")];
    for await (const batch of fetchRowsInBatches(svc, f)) {
      for (const r of batch.rows) {
        lines.push(rowToCsv(r, batch.profiles.get(r.actor_user_id)));
        total++;
      }
    }
    const path = `${f.organization_id}/${jobId}.csv`;
    const body = new TextEncoder().encode(lines.join("\n"));
    const { error: upErr } = await svc.storage.from("audit-exports").upload(path, body, {
      contentType: "text/csv; charset=utf-8",
      upsert: true,
    });
    if (upErr) throw upErr;
    await svc.from("audit_export_jobs").update({
      status: "completed",
      row_count: total,
      file_path: path,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  } catch (err) {
    await svc.from("audit_export_jobs").update({
      status: "failed",
      error: String((err as Error).message ?? err),
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "Unauthorized" });

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => null);
    const v = validate(body);
    if (!v.ok) return json(400, { error: v.error });

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorization: must be owner/ceo/auditor of organization_id (server-side check, do not trust client).
    const { data: member } = await svc
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", v.data.organization_id)
      .maybeSingle();
    if (!member || !["owner", "ceo", "auditor"].includes(member.role)) {
      return json(403, { error: "Forbidden" });
    }

    if (v.mode === "queue") {
      const { data: job, error: jobErr } = await svc.from("audit_export_jobs").insert({
        organization_id: v.data.organization_id,
        requested_by: user.id,
        filters: v.data,
        status: "queued",
      }).select("id").single();
      if (jobErr || !job) return json(500, { error: jobErr?.message ?? "Failed to enqueue" });

      const work = buildAndUpload(svc, job.id, v.data);
      // @ts-ignore EdgeRuntime is provided in Supabase Edge runtime
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(work);
      } else {
        // fall back: detached promise
        work.catch((e) => console.error("export job failed", e));
      }
      return json(202, { job_id: job.id, status: "queued" });
    }

    // mode === "download": stream
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          controller.enqueue(enc.encode(COLUMNS.join(",") + "\n"));
          for await (const batch of fetchRowsInBatches(svc, v.data)) {
            for (const r of batch.rows) {
              controller.enqueue(enc.encode(rowToCsv(r, batch.profiles.get(r.actor_user_id)) + "\n"));
            }
          }
          controller.close();
        } catch (err) {
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
    return json(500, { error: String((err as Error).message ?? err) });
  }
});
