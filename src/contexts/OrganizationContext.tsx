import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

export type AppRole =
  | 'owner'
  | 'ceo'
  | 'cfo'
  | 'finance_manager'
  | 'accounting_manager'
  | 'hr_manager'
  | 'auditor'
  | 'team_manager'
  | 'accountant'
  | 'analyst'
  | 'employee'
  | 'viewer';

export interface Organization {
  id: string;
  name: string;
  type: string;
  description: string | null;
  created_by: string;
}

export interface Membership {
  organization: Organization;
  role: AppRole;
}

const ACTIVE_ORG_KEY = 'savvy.activeOrgId';

const LEADER_ROLES: AppRole[] = ['owner', 'ceo', 'cfo', 'hr_manager', 'finance_manager'];
const HR_LEADER_ROLES: AppRole[] = ['owner', 'ceo', 'hr_manager'];
const READONLY_ROLES: AppRole[] = ['viewer', 'auditor'];

interface OrgContextValue {
  organization: Organization | null;
  role: AppRole | null;
  memberships: Membership[];
  loading: boolean;
  refresh: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
  // permission helpers
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  canManageTasks: boolean;
  canEditFinance: boolean;
  canManageOrgStructure: boolean; // departments / teams
  canManageEmployees: boolean;
  isOwner: boolean;
  isViewer: boolean;
  isAuditor: boolean;
  canEdit: boolean;
}

const OrganizationContext = createContext<OrgContextValue>({
  organization: null,
  role: null,
  memberships: [],
  loading: true,
  refresh: async () => {},
  switchOrganization: async () => {},
  hasRole: () => false,
  hasAnyRole: () => false,
  canManageTasks: false,
  canEditFinance: false,
  canManageOrgStructure: false,
  canManageEmployees: false,
  isOwner: false,
  isViewer: false,
  isAuditor: false,
  canEdit: false,
});

export const useOrganization = () => useContext(OrganizationContext);

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setActiveOrgId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('organization_members')
      .select('role, organization_id, organizations(*)')
      .eq('user_id', user.id);

    const list: Membership[] = (data ?? [])
      .filter((m: any) => m.organizations)
      .map((m: any) => ({ organization: m.organizations as Organization, role: m.role as AppRole }));
    setMemberships(list);

    // Resolve active org from local pref → DB pref → first
    const stored = localStorage.getItem(ACTIVE_ORG_KEY);
    let active = stored && list.some((m) => m.organization.id === stored) ? stored : null;
    if (!active) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();
      const pref = (settings?.preferences as any)?.activeOrganizationId;
      if (pref && list.some((m) => m.organization.id === pref)) active = pref;
    }
    if (!active && list.length) active = list[0].organization.id;
    setActiveOrgId(active);
    if (active) localStorage.setItem(ACTIVE_ORG_KEY, active);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const switchOrganization = useCallback(async (orgId: string) => {
    if (!memberships.some((m) => m.organization.id === orgId)) return;
    setActiveOrgId(orgId);
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    if (user) {
      const { data: existing } = await supabase
        .from('user_settings')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();
      const next = { ...((existing?.preferences as any) || {}), activeOrganizationId: orgId };
      await supabase.from('user_settings').upsert(
        { user_id: user.id, preferences: next as any },
        { onConflict: 'user_id' },
      );
    }
  }, [memberships, user]);

  const active = memberships.find((m) => m.organization.id === activeOrgId) ?? null;
  const organization = active?.organization ?? null;
  const role = active?.role ?? null;

  const hasRole = (r: AppRole) => role === r;
  const hasAnyRole = (roles: AppRole[]) => !!role && roles.includes(role);

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        role,
        memberships,
        loading,
        refresh,
        switchOrganization,
        hasRole,
        hasAnyRole,
        canManageTasks: hasAnyRole(['owner', 'ceo', 'cfo', 'finance_manager', 'accounting_manager', 'accountant']),
        canEditFinance: hasAnyRole(['owner', 'ceo', 'cfo', 'finance_manager', 'accounting_manager', 'accountant', 'analyst']),
        canManageOrgStructure: hasAnyRole(LEADER_ROLES),
        canManageEmployees: hasAnyRole(HR_LEADER_ROLES),
        isOwner: role === 'owner',
        isViewer: role === 'viewer',
        isAuditor: role === 'auditor',
        canEdit: !!role && !READONLY_ROLES.includes(role),
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};
