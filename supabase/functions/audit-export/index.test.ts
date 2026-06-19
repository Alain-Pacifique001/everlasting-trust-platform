// Integration tests for the audit-export edge function.
//
// These tests exercise the deployed function over HTTP using the dotenv-loaded
// VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
//
// They use the SUPABASE_SERVICE_ROLE_KEY to provision two short-lived test users
// in two distinct organizations, then verify the RBAC + isolation invariants.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FN_URL = `${SUPABASE_URL}/functions/v1/audit-export`;

const callExport = async (token: string | null, body: unknown) => {
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: ANON };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(FN_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON (e.g. streamed CSV) */ }
  return { status: res.status, body: json ?? text };
};

const skipIfNoServiceRole = () => {
  if (!SERVICE_ROLE) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY missing — skipping fixture-bound tests");
    return true;
  }
  return false;
};

const rand = () => crypto.randomUUID().slice(0, 8);

type Fixture = {
  admin: ReturnType<typeof createClient>;
  ownerToken: string;
  ownerUserId: string;
  otherToken: string;
  otherUserId: string;
  orgA: string;
  orgB: string;
  cleanup: () => Promise<void>;
};

const setupFixture = async (): Promise<Fixture> => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const mkUser = async (email: string) => {
    const password = `Pass!${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("user create failed");
    const userClient = createClient(SUPABASE_URL, ANON);
    const { data: s, error: sErr } = await userClient.auth.signInWithPassword({ email, password });
    if (sErr || !s.session) throw sErr ?? new Error("sign-in failed");
    return { id: data.user.id, token: s.session.access_token };
  };

  const owner = await mkUser(`owner-${rand()}@test.savvy.local`);
  const other = await mkUser(`other-${rand()}@test.savvy.local`);

  const mkOrg = async (creatorId: string, name: string) => {
    const { data, error } = await admin.from("organizations").insert({ name, type: "business", created_by: creatorId }).select("id").single();
    if (error || !data) throw error;
    return data.id as string;
  };
  const orgA = await mkOrg(owner.id, `OrgA-${rand()}`);
  const orgB = await mkOrg(other.id, `OrgB-${rand()}`);

  return {
    admin, ownerToken: owner.token, ownerUserId: owner.id,
    otherToken: other.token, otherUserId: other.id,
    orgA, orgB,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(owner.id).catch(() => {});
      await admin.auth.admin.deleteUser(other.id).catch(() => {});
    },
  };
};

Deno.test("rejects requests without a Bearer token", async () => {
  const r = await callExport(null, { organization_id: crypto.randomUUID(), mode: "queue" });
  assertEquals(r.status, 401);
});

Deno.test("rejects invalid Bearer token", async () => {
  const r = await callExport("not-a-real-jwt", { organization_id: crypto.randomUUID(), mode: "queue" });
  assertEquals(r.status, 401);
});

Deno.test("rejects malformed organization_id (400)", async () => {
  if (skipIfNoServiceRole()) return;
  const f = await setupFixture();
  try {
    const r = await callExport(f.ownerToken, { organization_id: "not-a-uuid", mode: "queue" });
    assertEquals(r.status, 400);
  } finally { await f.cleanup(); }
});

Deno.test("authorized owner can enqueue export", async () => {
  if (skipIfNoServiceRole()) return;
  const f = await setupFixture();
  try {
    const r = await callExport(f.ownerToken, { organization_id: f.orgA, mode: "queue" });
    assertEquals(r.status, 202);
    assertEquals(typeof (r.body as any).job_id, "string");
  } finally { await f.cleanup(); }
});

Deno.test("cross-org access is blocked (403)", async () => {
  if (skipIfNoServiceRole()) return;
  const f = await setupFixture();
  try {
    // owner of orgA tries to export orgB → must be denied
    const r = await callExport(f.ownerToken, { organization_id: f.orgB, mode: "queue" });
    assertEquals(r.status, 403);
  } finally { await f.cleanup(); }
});

Deno.test("non-member of any org is denied (403)", async () => {
  if (skipIfNoServiceRole()) return;
  const f = await setupFixture();
  try {
    // create a 3rd user with no membership and try orgA
    const email = `nobody-${rand()}@test.savvy.local`;
    const pw = `Pass!${crypto.randomUUID()}`;
    const { data: u } = await f.admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    const c = createClient(SUPABASE_URL, ANON);
    const { data: s } = await c.auth.signInWithPassword({ email, password: pw });
    const r = await callExport(s!.session!.access_token, { organization_id: f.orgA, mode: "queue" });
    assertEquals(r.status, 403);
    await f.admin.auth.admin.deleteUser(u.user!.id);
  } finally { await f.cleanup(); }
});

Deno.test("cancel: rejects bad job_id (400)", async () => {
  if (skipIfNoServiceRole()) return;
  const f = await setupFixture();
  try {
    const r = await callExport(f.ownerToken, { mode: "cancel", organization_id: f.orgA, job_id: "nope" });
    assertEquals(r.status, 400);
  } finally { await f.cleanup(); }
});

Deno.test("cancel: 404 when the job does not exist", async () => {
  if (skipIfNoServiceRole()) return;
  const f = await setupFixture();
  try {
    const r = await callExport(f.ownerToken, {
      mode: "cancel", organization_id: f.orgA, job_id: crypto.randomUUID(),
    });
    assertEquals(r.status, 404);
  } finally { await f.cleanup(); }
});

Deno.test("cancel: queues then cancels a job and persists status", async () => {
  if (skipIfNoServiceRole()) return;
  const f = await setupFixture();
  try {
    // Enqueue
    const enq = await callExport(f.ownerToken, { organization_id: f.orgA, mode: "queue" });
    assertEquals(enq.status, 202);
    const jobId = (enq.body as any).job_id as string;

    // Cancel
    const cancel = await callExport(f.ownerToken, {
      mode: "cancel", organization_id: f.orgA, job_id: jobId, reason: "test",
    });
    // Could be 200 (cancelled / cancelling) or 409 if it already completed (org has 0 rows → very fast)
    if (cancel.status !== 200 && cancel.status !== 409) {
      throw new Error(`Unexpected cancel status ${cancel.status}: ${JSON.stringify(cancel.body)}`);
    }

    // Verify persistence: row must be in a terminal state
    const { data: job } = await f.admin
      .from("audit_export_jobs")
      .select("status,cancellation_requested_at,cancelled_by")
      .eq("id", jobId)
      .single();
    if (cancel.status === 200) {
      // Either cancelled outright, or cancellation_requested_at is set
      if (!(job?.status === "cancelled" || job?.cancellation_requested_at)) {
        throw new Error(`Expected cancellation marker, got ${JSON.stringify(job)}`);
      }
      assertEquals(job?.cancelled_by, f.ownerUserId);
    }
  } finally { await f.cleanup(); }
});

Deno.test("cancel: cross-org cancel attempt is denied (403)", async () => {
  if (skipIfNoServiceRole()) return;
  const f = await setupFixture();
  try {
    // Create a job in orgA as owner
    const enq = await callExport(f.ownerToken, { organization_id: f.orgA, mode: "queue" });
    const jobId = (enq.body as any).job_id;
    // Other user (member of orgB only) tries to cancel it via orgA → 403
    const r = await callExport(f.otherToken, {
      mode: "cancel", organization_id: f.orgA, job_id: jobId,
    });
    assertEquals(r.status, 403);
  } finally { await f.cleanup(); }
});

