import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Trash2, Pencil, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Team {
  id: string;
  name: string;
  description: string | null;
  manager_user_id: string | null;
  department_id: string;
}
interface Department { id: string; name: string }
interface MemberOption { user_id: string; name: string }

export const TeamsPanel = () => {
  const { user } = useAuth();
  const { organization, canManageOrgStructure } = useOrganization();
  const [teams, setTeams] = useState<Team[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState({ name: '', description: '', department_id: '', manager_user_id: '' });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const [{ data: ts }, { data: ds }, { data: ms }] = await Promise.all([
      supabase.from('teams').select('*').eq('organization_id', organization.id).order('name'),
      supabase.from('departments').select('id,name').eq('organization_id', organization.id).order('name'),
      supabase.from('organization_members').select('user_id').eq('organization_id', organization.id),
    ]);
    setTeams((ts ?? []) as Team[]);
    setDepartments((ds ?? []) as Department[]);
    const ids = (ms ?? []).map((m: any) => m.user_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles').select('user_id, full_name, email').in('user_id', ids);
      setMembers((profs ?? []).map((p: any) => ({
        user_id: p.user_id, name: p.full_name?.trim() || p.email || 'Unknown',
      })));
    }
    setLoading(false);
  }, [organization]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const reset = () => { setForm({ name: '', description: '', department_id: '', manager_user_id: '' }); setEditing(null); };
  const openCreate = () => {
    reset();
    if (departments[0]) setForm((f) => ({ ...f, department_id: departments[0].id }));
    setOpen(true);
  };
  const openEdit = (t: Team) => {
    setEditing(t);
    setForm({
      name: t.name, description: t.description ?? '',
      department_id: t.department_id, manager_user_id: t.manager_user_id ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!organization || !user) return;
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.department_id) { toast.error('Pick a department first'); return; }
    setSaving(true);
    const payload = {
      organization_id: organization.id,
      department_id: form.department_id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      manager_user_id: form.manager_user_id || null,
      created_by: user.id,
    };
    const { error } = editing
      ? await supabase.from('teams').update(payload).eq('id', editing.id)
      : await supabase.from('teams').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? 'Team updated' : 'Team created');
    setOpen(false); reset(); fetchAll();
  };

  const remove = async (t: Team) => {
    if (!confirm(`Delete team ${t.name}?`)) return;
    const { error } = await supabase.from('teams').delete().eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Team deleted');
    fetchAll();
  };

  if (!organization) return null;
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—';
  const memberName = (id: string | null) => members.find((m) => m.user_id === id)?.name ?? '—';
  const canCreate = canManageOrgStructure && departments.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" /> Teams
          </CardTitle>
          <CardDescription>Smaller groups inside departments, led by a manager.</CardDescription>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit team' : 'Create team'}</DialogTitle>
                <DialogDescription>Teams roll up to a department and have one manager.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick a department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Accountants" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="space-y-1.5">
                  <Label>Team manager</Label>
                  <Select value={form.manager_user_id || 'none'} onValueChange={(v) => setForm({ ...form, manager_user_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editing ? 'Save' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {departments.length === 0
              ? 'Create a department first, then you can add teams to it.'
              : 'No teams yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {teams.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{t.name}</p>
                    <Badge variant="outline" className="text-[10px]">{deptName(t.department_id)}</Badge>
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">Manager: {memberName(t.manager_user_id)}</p>
                </div>
                {canManageOrgStructure && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(t)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(t)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
