import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { Trash2, Plus, Loader2 } from 'lucide-react';

const ROLES = ['accountant', 'analyst', 'employee', 'team_manager', 'auditor', 'viewer'] as const;

type Config = {
  id: string;
  role: string;
  label: string | null;
  description: string | null;
  is_active: boolean;
  requires_approval: boolean;
  max_users: number | null;
  current_user_count: number;
};

const SignupRoleConfigPage = () => {
  const { organization } = useOrganization();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>(ROLES[0]);
  const [label, setLabel] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [maxUsers, setMaxUsers] = useState<string>('');

  const load = async () => {
    if (!organization) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('signup_role_configs')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at');
    setConfigs(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [organization?.id]);

  const add = async () => {
    if (!organization) return;
    const { error } = await (supabase as any).from('signup_role_configs').insert({
      organization_id: organization.id,
      role,
      label: label || null,
      requires_approval: requiresApproval,
      max_users: maxUsers ? Number(maxUsers) : null,
    });
    if (error) { toast.error(error.message); return; }
    setLabel(''); setMaxUsers('');
    toast.success('Signup role added');
    load();
  };

  const toggle = async (c: Config, field: 'is_active' | 'requires_approval', value: boolean) => {
    const { error } = await (supabase as any).from('signup_role_configs').update({ [field]: value }).eq('id', c.id);
    if (error) toast.error(error.message); else load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from('signup_role_configs').delete().eq('id', id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Signup roles</h1>
        <p className="text-sm text-muted-foreground">Choose which roles new users can request when signing up.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add signup role</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Label</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Display label" />
          </div>
          <div className="space-y-1">
            <Label>Max users</Label>
            <Input type="number" min={0} value={maxUsers} onChange={e => setMaxUsers(e.target.value)} placeholder="Unlimited" />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} />
            <Label>Requires approval</Label>
          </div>
          <Button onClick={add}><Plus className="w-4 h-4 mr-1" />Add</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Configured roles</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> :
            configs.length === 0 ? <p className="text-sm text-muted-foreground">No roles configured yet.</p> :
            <div className="space-y-2">
              {configs.map(c => (
                <div key={c.id} className="flex items-center justify-between border rounded p-3 text-sm">
                  <div>
                    <div className="font-medium">{c.label ?? c.role} <span className="text-muted-foreground">({c.role})</span></div>
                    <div className="text-xs text-muted-foreground">Users: {c.current_user_count}{c.max_users ? ` / ${c.max_users}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1"><Switch checked={c.is_active} onCheckedChange={(v) => toggle(c, 'is_active', v)} /><span className="text-xs">Active</span></div>
                    <div className="flex items-center gap-1"><Switch checked={c.requires_approval} onCheckedChange={(v) => toggle(c, 'requires_approval', v)} /><span className="text-xs">Approval</span></div>
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
};

export default SignupRoleConfigPage;
