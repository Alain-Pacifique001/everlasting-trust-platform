// Edge guard for collaboration / voice endpoints:
//   1. Authenticates the caller via their JWT
//   2. Checks role_permissions for the requested module + action
//   3. Applies an in-memory rate limit per (user, module, action)
//
// Call from the client BEFORE issuing a sensitive write:
//   const { data, error } = await supabase.functions.invoke('module-guard', {
//     body: { module: 'voice_briefings', action: 'manage' }
//   });
//   if (error) -> show "Access denied" or "Rate limit"
//
// This is a best-effort guard. RLS is still the source of truth.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action = 'view' | 'manage';
type Module = 'collaboration' | 'voice_briefings';

// Token-bucket rate limit per warm instance.
// 30 requests / 60s for view, 10 / 60s for manage. Tunable.
const LIMITS: Record<Action, { tokens: number; refillMs: number }> = {
  view:   { tokens: 30, refillMs: 60_000 },
  manage: { tokens: 10, refillMs: 60_000 },
};
const buckets = new Map<string, { tokens: number; lastRefill: number }>();

function consume(key: string, action: Action): boolean {
  const cfg = LIMITS[action];
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: cfg.tokens, lastRefill: now };
  const elapsed = now - b.lastRefill;
  if (elapsed > cfg.refillMs) {
    b.tokens = cfg.tokens;
    b.lastRefill = now;
  }
  if (b.tokens <= 0) { buckets.set(key, b); return false; }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return json({ error: 'unauthorized' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userRes, error: uErr } = await supabase.auth.getUser();
    if (uErr || !userRes?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const mod = body.module as Module;
    const action = (body.action ?? 'view') as Action;
    if (!['collaboration', 'voice_briefings'].includes(mod)) {
      return json({ error: 'invalid module' }, 400);
    }
    if (!['view', 'manage'].includes(action)) {
      return json({ error: 'invalid action' }, 400);
    }

    // Active org
    const { data: orgRow } = await supabase.rpc('get_active_org', { _user_id: userId });
    const orgId = orgRow as string | null;
    if (!orgId) return json({ error: 'no organization' }, 403);

    // Find caller role
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId).eq('organization_id', orgId).maybeSingle();
    const role = membership?.role;
    if (!role) return json({ error: 'not a member' }, 403);

    // role_permissions override; absence = use default matrix below
    const { data: perm } = await supabase
      .from('role_permissions')
      .select('can_view, can_manage')
      .eq('organization_id', orgId).eq('module', mod).eq('role', role).maybeSingle();

    let allowed = false;
    if (perm) {
      allowed = action === 'view' ? !!perm.can_view : !!perm.can_manage;
    } else {
      // mirror src/hooks/useModuleAccess.ts defaults
      const viewRoles = ['owner','ceo','cfo','finance_manager','accounting_manager','hr_manager','auditor','team_manager','accountant','analyst','employee'];
      const manageRoles = mod === 'voice_briefings'
        ? ['owner','ceo','cfo','finance_manager','hr_manager']
        : ['owner','ceo','cfo','finance_manager','hr_manager','team_manager'];
      allowed = action === 'view' ? viewRoles.includes(role) : manageRoles.includes(role);
    }
    if (!allowed) return json({ error: 'forbidden', code: 'rbac_denied' }, 403);

    if (!consume(`${userId}:${mod}:${action}`, action)) {
      return json({ error: 'rate limit exceeded', code: 'rate_limited' }, 429);
    }

    return json({ ok: true, role, module: mod, action });
  } catch (e) {
    console.error('module-guard error', e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
