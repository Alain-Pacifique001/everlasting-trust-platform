import { useEffect, useState } from 'react';
import { useOrganization, AppRole } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';

export type AppModule = 'collaboration' | 'voice_briefings';

export const ALL_MODULES: AppModule[] = ['collaboration', 'voice_briefings'];
export const ALL_ROLES: AppRole[] = [
  'owner', 'ceo', 'cfo', 'finance_manager', 'accounting_manager',
  'hr_manager', 'auditor', 'team_manager', 'accountant', 'analyst', 'employee', 'viewer',
];

const DEFAULT_MATRIX: Record<AppModule, { view: AppRole[]; manage: AppRole[] }> = {
  collaboration: {
    view: ['owner', 'ceo', 'cfo', 'finance_manager', 'accounting_manager', 'hr_manager', 'auditor', 'team_manager', 'accountant', 'analyst', 'employee'],
    manage: ['owner', 'ceo', 'cfo', 'finance_manager', 'hr_manager', 'team_manager'],
  },
  voice_briefings: {
    view: ['owner', 'ceo', 'cfo', 'finance_manager', 'accounting_manager', 'hr_manager', 'auditor', 'team_manager', 'accountant', 'analyst', 'employee'],
    manage: ['owner', 'ceo', 'cfo', 'finance_manager', 'hr_manager'],
  },
};

export function defaultAccess(mod: AppModule, role: AppRole | null) {
  if (!role) return { canView: false, canManage: false };
  const cfg = DEFAULT_MATRIX[mod];
  return { canView: cfg.view.includes(role), canManage: cfg.manage.includes(role) };
}

export function useModuleAccess(mod: AppModule) {
  const { role, organization } = useOrganization();
  const [override, setOverride] = useState<{ canView: boolean; canManage: boolean } | null>(null);

  useEffect(() => {
    if (!organization || !role) { setOverride(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('role_permissions')
        .select('can_view, can_manage')
        .eq('organization_id', organization.id)
        .eq('module', mod)
        .eq('role', role)
        .maybeSingle();
      if (cancelled) return;
      if (data) setOverride({ canView: !!data.can_view, canManage: !!data.can_manage });
      else setOverride(null);
    })();
    return () => { cancelled = true; };
  }, [organization, role, mod]);

  const base = defaultAccess(mod, role);
  const eff = override ?? base;
  return { canView: eff.canView, canManage: eff.canManage, role };
}
