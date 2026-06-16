import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization, AppRole } from '@/contexts/OrganizationContext';
import { ALL_MODULES, ALL_ROLES, AppModule, defaultAccess } from '@/hooks/useModuleAccess';
import { toast } from '@/components/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Row = { role: AppRole; module: AppModule; can_view: boolean; can_manage: boolean };

const MODULE_LABEL: Record<AppModule, string> = {
  collaboration: 'Team Collaboration',
  voice_briefings: 'Voice Briefings',
};

const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Owner', ceo: 'CEO', cfo: 'CFO', finance_manager: 'Finance Mgr',
  accounting_manager: 'Accounting Mgr', hr_manager: 'HR Mgr', auditor: 'Auditor',
  team_manager: 'Team Mgr', accountant: 'Accountant', analyst: 'Analyst',
  employee: 'Employee', viewer: 'Viewer',
};

export default function RolePermissionsPanel() {
  const { organization, hasAnyRole } = useOrganization();
  const isAdmin = hasAnyRole(['owner', 'ceo']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!organization) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('role_permissions')
        .select('role, module, can_view, can_manage')
        .eq('organization_id', organization.id);
      const map = new Map<string, Row>();
      (data ?? []).forEach((r: any) => map.set(`${r.role}:${r.module}`, r));
      const built: Row[] = [];
      for (const role of ALL_ROLES) {
        for (const mod of ALL_MODULES) {
          const existing = map.get(`${role}:${mod}`);
          if (existing) built.push(existing);
          else {
            const d = defaultAccess(mod, role);
            built.push({ role, module: mod, can_view: d.canView, can_manage: d.canManage });
          }
        }
      }
      setRows(built);
      setLoading(false);
    })();
  }, [organization]);

  const grouped = useMemo(() => {
    const byMod: Record<AppModule, Row[]> = { collaboration: [], voice_briefings: [] };
    rows.forEach((r) => byMod[r.module].push(r));
    return byMod;
  }, [rows]);

  const update = (role: AppRole, module: AppModule, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) =>
      r.role === role && r.module === module ? { ...r, ...patch } : r
    ));
  };

  const save = async () => {
    if (!organization) return;
    setSaving(true);
    const payload = rows.map((r) => ({
      organization_id: organization.id,
      role: r.role, module: r.module,
      can_view: r.can_view, can_manage: r.can_manage,
    }));
    const { error } = await supabase
      .from('role_permissions')
      .upsert(payload, { onConflict: 'organization_id,role,module' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Role permissions saved');
  };

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" /> Role & Permission Management
        </CardTitle>
        <CardDescription>
          Choose which roles can view and manage each module. Saved overrides apply to all members in this organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          ALL_MODULES.map((mod) => (
            <div key={mod}>
              <h4 className="font-medium mb-2">{MODULE_LABEL[mod]}</h4>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Role</TableHead>
                      <TableHead className="w-[120px] text-center">Can View</TableHead>
                      <TableHead className="w-[140px] text-center">Can Manage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped[mod].map((r) => (
                      <TableRow key={`${r.role}-${r.module}`}>
                        <TableCell className="font-medium">{ROLE_LABEL[r.role]}</TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={r.can_view}
                            onCheckedChange={(v) => update(r.role, r.module, { can_view: v, can_manage: v ? r.can_manage : false })}
                            disabled={r.role === 'owner'}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={r.can_manage}
                            onCheckedChange={(v) => update(r.role, r.module, { can_manage: v, can_view: v || r.can_view })}
                            disabled={r.role === 'owner'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
        <Button onClick={save} disabled={saving || loading} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save permissions
        </Button>
      </CardContent>
    </Card>
  );
}
