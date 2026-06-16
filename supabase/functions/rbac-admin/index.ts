// RBAC admin edge function — privileged role/permission/user-assignment writes
// with audit logging and rate limiting.
//
// Actions:
//   - create_role   { slug, name, description? }
//   - rename_role   { slug, name, description? }
//   - delete_role   { slug }
//   - set_permissions { role_slug, permissions: { [permission_key]: boolean } }
//   - assign_role   { target_user_id, role }    // role must be a valid app_role enum
//
// Returns 200 ok, 401 unauthorized, 403 forbidden, 409 conflict, 429 rate_limited, 500 error.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 60 req / 60s per user
const buckets = new Map<string, { tokens: number; lastRefill: number }>();
function consume(key: string): boolean {
  const cfg = { tokens: 60, refillMs: 60_000 };
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: cfg.tokens, lastRefill: now };
  if (now - b.lastRefill > cfg.refillMs) { b.tokens = cfg.tokens; b.lastRefill = now; }
  if (b.tokens <= 0) { buckets.set(key, b); return false; }
  b.tokens -= 1; buckets.set(key, b);
  return true;
}

const SLUG_RE = /^[a-z][a-z0-9_-]{1,39}$/;
const APP_ROLES = new Set([
  'owner','ceo','cfo','finance_manager','accounting_manager','hr_manager',
  'auditor','team_manager','accountant','analyst','employee','viewer',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const adminClient = createClient(SUPABASE_URL, SERVICE);

    const { data: userRes, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userRes?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userRes.user.id;
    const userEmail = userRes.user.email ?? null;

    if (!consume(userId)) return json({ error: 'rate_limited' }, 429);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    if (!action) return json({ error: 'missing action' }, 400);

    // Active org
    const { data: orgRpc } = await userClient.rpc('get_active_org', { _user_id: userId });
    const orgId = orgRpc as string | null;
    if (!orgId) return json({ error: 'no organization' }, 403);

    // Authorize: caller must be owner or ceo
    const { data: isAdminRpc } = await adminClient.rpc('has_any_role', {
      _user_id: userId, _org_id: orgId, _roles: ['owner', 'ceo'],
    });
    if (!isAdminRpc) return json({ error: 'forbidden' }, 403);

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;

    const audit = async (
      event_type: string,
      target_role: string | null,
      target_user_id: string | null,
      previous_value: unknown,
      new_value: unknown,
      metadata: Record<string, unknown> = {},
    ) => {
      await adminClient.from('rbac_audit_log').insert({
        organization_id: orgId,
        actor_user_id: userId,
        actor_email: userEmail,
        event_type,
        target_role,
        target_user_id,
        previous_value: previous_value ?? null,
        new_value: new_value ?? null,
        metadata,
        ip_address: ip,
      });
    };

    switch (action) {
      case 'create_role': {
        const slug = String(body.slug || '').toLowerCase().trim();
        const name = String(body.name || '').trim();
        const description = body.description ? String(body.description).trim() : null;
        if (!SLUG_RE.test(slug)) return json({ error: 'invalid slug (lowercase, 2-40 chars, a-z0-9_-)' }, 400);
        if (name.length < 2 || name.length > 80) return json({ error: 'invalid name' }, 400);

        const { data: existing } = await adminClient.from('custom_roles')
          .select('id').eq('organization_id', orgId).eq('slug', slug).maybeSingle();
        if (existing) return json({ error: 'role slug already exists' }, 409);

        const { data: row, error } = await adminClient.from('custom_roles')
          .insert({ organization_id: orgId, slug, name, description, is_system: false, created_by: userId })
          .select().single();
        if (error) return json({ error: error.message }, 500);
        await audit('role.create', slug, null, null, row);
        return json({ ok: true, role: row });
      }

      case 'rename_role': {
        const slug = String(body.slug || '').toLowerCase().trim();
        const name = String(body.name || '').trim();
        const description = body.description !== undefined ? String(body.description).trim() : undefined;
        if (!slug || !name || name.length > 80) return json({ error: 'invalid input' }, 400);

        const { data: before } = await adminClient.from('custom_roles')
          .select('*').eq('organization_id', orgId).eq('slug', slug).maybeSingle();
        if (!before) return json({ error: 'role not found' }, 404);
        if (before.is_system) return json({ error: 'system roles cannot be renamed' }, 403);

        const patch: Record<string, unknown> = { name };
        if (description !== undefined) patch.description = description;
        const { data: after, error } = await adminClient.from('custom_roles')
          .update(patch).eq('id', before.id).select().single();
        if (error) return json({ error: error.message }, 500);
        await audit('role.rename', slug, null, before, after);
        return json({ ok: true, role: after });
      }

      case 'delete_role': {
        const slug = String(body.slug || '').toLowerCase().trim();
        const { data: before } = await adminClient.from('custom_roles')
          .select('*').eq('organization_id', orgId).eq('slug', slug).maybeSingle();
        if (!before) return json({ error: 'role not found' }, 404);
        if (before.is_system) return json({ error: 'system roles cannot be deleted' }, 403);

        const { error } = await adminClient.rpc('delete_custom_role', { _org: orgId, _slug: slug });
        if (error) return json({ error: error.message }, 500);
        await audit('role.delete', slug, null, before, null);
        return json({ ok: true });
      }

      case 'set_permissions': {
        const role_slug = String(body.role_slug || '').toLowerCase().trim();
        const perms = (body.permissions || {}) as Record<string, boolean>;
        if (!role_slug) return json({ error: 'role_slug required' }, 400);

        const { data: before } = await adminClient.from('custom_role_permissions')
          .select('permission_key, granted').eq('organization_id', orgId).eq('role_slug', role_slug);

        const rows = Object.entries(perms).map(([permission_key, granted]) => ({
          organization_id: orgId, role_slug, permission_key,
          granted: !!granted, updated_by: userId,
        }));
        if (rows.length > 0) {
          const { error } = await adminClient.from('custom_role_permissions')
            .upsert(rows, { onConflict: 'organization_id,role_slug,permission_key' });
          if (error) return json({ error: error.message }, 500);
        }

        // Mirror collaboration/voice module view/manage into legacy role_permissions
        // so useModuleAccess (which reads that table) stays in sync — only when slug matches an app_role.
        if (APP_ROLES.has(role_slug)) {
          for (const mod of ['collaboration', 'voice_briefings'] as const) {
            const vKey = `${mod}.view`, mKey = `${mod}.manage`;
            if (vKey in perms || mKey in perms) {
              const { data: existing } = await adminClient.from('role_permissions')
                .select('can_view, can_manage')
                .eq('organization_id', orgId).eq('role', role_slug).eq('module', mod).maybeSingle();
              const can_view = vKey in perms ? !!perms[vKey] : !!existing?.can_view;
              const can_manage = mKey in perms ? !!perms[mKey] : !!existing?.can_manage;
              await adminClient.from('role_permissions').upsert({
                organization_id: orgId, role: role_slug, module: mod, can_view, can_manage,
              }, { onConflict: 'organization_id,role,module' });
            }
          }
        }

        await audit('permissions.update', role_slug, null, before, rows);
        return json({ ok: true });
      }

      case 'assign_role': {
        const target = String(body.target_user_id || '');
        const role = String(body.role || '');
        if (!target || !APP_ROLES.has(role)) return json({ error: 'invalid input' }, 400);

        const { data: before } = await adminClient.from('organization_members')
          .select('role').eq('organization_id', orgId).eq('user_id', target).maybeSingle();
        if (!before) return json({ error: 'user is not a member' }, 404);

        // prevent the only owner from demoting themselves
        if (before.role === 'owner' && role !== 'owner') {
          const { count } = await adminClient.from('organization_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('organization_id', orgId).eq('role', 'owner');
          if ((count ?? 0) <= 1) return json({ error: 'cannot remove the last owner' }, 409);
        }

        const { error } = await adminClient.from('organization_members')
          .update({ role }).eq('organization_id', orgId).eq('user_id', target);
        if (error) return json({ error: error.message }, 500);
        await audit('user.role_change', role, target, { role: before.role }, { role });
        return json({ ok: true });
      }

      default:
        return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    console.error('rbac-admin error', e);
    return json({ error: String(e) }, 500);
  }
});
