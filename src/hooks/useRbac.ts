import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface CustomRole {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Permission {
  key: string;
  module: string;
  action: string;
  label: string;
  description: string | null;
}

export interface RolePermissionRow {
  role_slug: string;
  permission_key: string;
  granted: boolean;
}

export interface AuditLogRow {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  event_type: string;
  target_role: string | null;
  target_user_id: string | null;
  previous_value: any;
  new_value: any;
  metadata: any;
  ip_address: string | null;
  created_at: string;
}

export function useRoles() {
  const { organization } = useOrganization();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const { data } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('organization_id', organization.id)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    setRoles((data ?? []) as CustomRole[]);
    setLoading(false);
  }, [organization]);

  useEffect(() => { refresh(); }, [refresh]);
  return { roles, loading, refresh };
}

export function usePermissionsCatalog() {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('permissions').select('*').order('module').order('action');
      setPerms((data ?? []) as Permission[]);
      setLoading(false);
    })();
  }, []);
  return { perms, loading };
}

export function useRolePermissions() {
  const { organization } = useOrganization();
  const [rows, setRows] = useState<RolePermissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const { data } = await supabase
      .from('custom_role_permissions')
      .select('role_slug, permission_key, granted')
      .eq('organization_id', organization.id);
    setRows((data ?? []) as RolePermissionRow[]);
    setLoading(false);
  }, [organization]);

  useEffect(() => { refresh(); }, [refresh]);
  return { rows, loading, refresh, setRows };
}

export function useAuditLog(filters: {
  event?: string; actor?: string; from?: string; to?: string;
  page: number; pageSize: number;
}) {
  const { organization } = useOrganization();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetcher = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    let q = supabase
      .from('rbac_audit_log')
      .select('*', { count: 'exact' })
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });
    if (filters.event && filters.event !== 'all') q = q.eq('event_type', filters.event);
    if (filters.actor) q = q.ilike('actor_email', `%${filters.actor}%`);
    if (filters.from) q = q.gte('created_at', filters.from);
    if (filters.to) q = q.lte('created_at', filters.to);
    const from = filters.page * filters.pageSize;
    const to = from + filters.pageSize - 1;
    const { data, count: c } = await q.range(from, to);
    setRows((data ?? []) as AuditLogRow[]);
    setCount(c ?? 0);
    setLoading(false);
  }, [organization, filters.event, filters.actor, filters.from, filters.to, filters.page, filters.pageSize]);

  useEffect(() => { fetcher(); }, [fetcher]);
  return { rows, count, loading, refresh: fetcher };
}

export async function callRbacAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('rbac-admin', { body });
  if (error) {
    const msg = (data as any)?.error || error.message || 'Request failed';
    throw new Error(msg);
  }
  if (data && (data as any).error) throw new Error((data as any).error);
  return data;
}
