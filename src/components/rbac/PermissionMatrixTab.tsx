import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, Sliders } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/sonner';
import {
  callRbacAdmin, useRolePermissions, useRoles, usePermissionsCatalog,
} from '@/hooks/useRbac';

// Default permission resolution (mirrors DB has_permission fallback).
const DEFAULT_FALLBACK: Record<string, (slug: string) => boolean> = {
  'collaboration.view':   (s) => ['ceo','cfo','finance_manager','accounting_manager','hr_manager','auditor','team_manager','accountant','analyst','employee'].includes(s),
  'collaboration.manage': (s) => ['ceo','cfo','finance_manager','hr_manager','team_manager'].includes(s),
  'voice_briefings.view': (s) => ['ceo','cfo','finance_manager','accounting_manager','hr_manager','auditor','team_manager','accountant','analyst','employee'].includes(s),
  'voice_briefings.manage': (s) => ['ceo','cfo','finance_manager','hr_manager'].includes(s),
  'roles.manage': (s) => ['ceo'].includes(s),
  'audit.view':   (s) => ['ceo'].includes(s),
};

export default function PermissionMatrixTab() {
  const { roles, loading: rolesL } = useRoles();
  const { perms, loading: permsL } = usePermissionsCatalog();
  const { rows, loading: rowsL, refresh, setRows } = useRolePermissions();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const byMod: Record<string, typeof perms> = {};
    perms.forEach((p) => { (byMod[p.module] ??= []).push(p); });
    return byMod;
  }, [perms]);

  const lookup = useMemo(() => {
    const m = new Map<string, boolean>();
    rows.forEach((r) => m.set(`${r.role_slug}:${r.permission_key}`, r.granted));
    return m;
  }, [rows]);

  const effective = (slug: string, key: string): boolean => {
    if (slug === 'owner') return true;
    const v = lookup.get(`${slug}:${key}`);
    if (v !== undefined) return v;
    return DEFAULT_FALLBACK[key]?.(slug) ?? false;
  };

  const toggle = async (slug: string, key: string, next: boolean) => {
    if (slug === 'owner') return;
    const pendingKey = `${slug}:${key}`;
    // Optimistic update
    const previous = rows.find((r) => r.role_slug === slug && r.permission_key === key);
    const optimistic = rows.filter((r) => !(r.role_slug === slug && r.permission_key === key));
    optimistic.push({ role_slug: slug, permission_key: key, granted: next });
    setRows(optimistic);
    setPending((s) => new Set(s).add(pendingKey));
    try {
      await callRbacAdmin({
        action: 'set_permissions',
        role_slug: slug,
        permissions: { [key]: next },
      });
    } catch (e: any) {
      // rollback
      const restored = rows.filter((r) => !(r.role_slug === slug && r.permission_key === key));
      if (previous) restored.push(previous);
      setRows(restored);
      toast.error(`Failed to update: ${e.message}`);
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(pendingKey); return n; });
      refresh();
    }
  };

  const loading = rolesL || permsL || rowsL;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sliders className="w-4 h-4 text-primary" /> Permission matrix
        </CardTitle>
        <CardDescription>
          Toggle a switch to grant or revoke a permission. Changes save automatically and apply immediately. Owner always has full access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          Object.entries(grouped).map(([mod, items]) => (
            <div key={mod}>
              <h4 className="font-medium mb-2 capitalize">{mod.replace(/_/g, ' ')}</h4>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Role</TableHead>
                      {items.map((p) => (
                        <TableHead key={p.key} className="text-center min-w-[140px]" title={p.description ?? ''}>
                          {p.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((r) => (
                      <TableRow key={r.slug}>
                        <TableCell className="font-medium">
                          {r.name}
                          <div className="text-xs text-muted-foreground font-mono">{r.slug}</div>
                        </TableCell>
                        {items.map((p) => {
                          const k = `${r.slug}:${p.key}`;
                          const isOwner = r.slug === 'owner';
                          return (
                            <TableCell key={p.key} className="text-center">
                              <Switch
                                checked={effective(r.slug, p.key)}
                                onCheckedChange={(v) => toggle(r.slug, p.key, v)}
                                disabled={isOwner || pending.has(k)}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
