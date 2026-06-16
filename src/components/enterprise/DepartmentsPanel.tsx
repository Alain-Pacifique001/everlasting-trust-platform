import { useEffect, useState, useCallback } from 'react';
import { Plus, Loader2, Trash2, Pencil, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Department {
  id: string;
  name: string;
  description: string | null;
  head_user_id: string | null;
  parent_id: string | null;
  created_at: string;
}

interface MemberOption { user_id: string; name: string }

export const DepartmentsPanel = () => {
  const { user } = useAuth();
  const { organization, canManageOrgStructure } = useOrganization();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: '', description: '', head_user_id: '', parent_id: '' });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const [{ data: depts }, { data: mems }] = await Promise.all([
      supabase.from('departments').select('*').eq('organization_id', organization.id).order('name'),
      supabase.from('organization_members').select('user_id').eq('organization_id', organization.id),
    ]);
    setDepartments((depts ?? []) as Department[]);
    const ids = (mems ?? []).map((m: any) => m.user_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles').select('user_id, full_name, email').in('user_id', ids);
      setMembers((profs ?? []).map((p: any) => ({
        user_id: p.user_id,
        name: p.full_name?.trim() || p.email || 'Unknown',
      })));
    }
    setLoading(false);
  }, [organization]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const reset = () => { setForm({ name: '', description: '', head_user_id: '', parent_id: '' }); setEditing(null); };

  const openCreate = () => { reset(); setOpen(true); };
  const openEdit = (d: Department) => {
    setEditing(d);
    setForm({
      name: d.name,
      description: d.description ?? '',
      head_user_id: d.head_user_id ?? '',
      parent_id: d.parent_id ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!organization || !user) return;
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const payload = {
      organization_id: organization.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      head_user_id: form.head_user_id || null,
      parent_id: form.parent_id || null,
      created_by: user.id,
    };
    const { error } = editing
      ? await supabase.from('departments').update(payload).eq('id', editing.id)
      : await supabase.from('departments').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? 'Department updated' : 'Department created');
    setOpen(false); reset(); fetchAll();
  };

  const remove = async (d: Department) => {
    if (!confirm(`Delete ${d.name}? Teams in this department will be removed.`)) return;
    const { error } = await supabase.from('departments').delete().eq('id', d.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Department deleted');
    fetchAll();
  };

  if (!organization) return null;
  const memberName = (id: string | null) => members.find((m) => m.user_id === id)?.name ?? '—';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building className="w-4 h-4" /> Departments
          </CardTitle>
          <CardDescription>Top-level units inside your organization.</CardDescription>
        </div>
        {canManageOrgStructure && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> New
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit department' : 'Create department'}</DialogTitle>
                <DialogDescription>Departments contain teams and have a head responsible for them.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Finance" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>
                <div className="space-y-1.5">
                  <Label>Department head</Label>
                  <Select value={form.head_user_id || 'none'} onValueChange={(v) => setForm({ ...form, head_user_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select a head" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Parent department (optional)</Label>
                  <Select value={form.parent_id || 'none'} onValueChange={(v) => setForm({ ...form, parent_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Top-level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Top-level —</SelectItem>
                      {departments.filter((d) => d.id !== editing?.id).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
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
        ) : departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No departments yet. Create your first one to start building the hierarchy.</p>
        ) : (
          <div className="space-y-2">
            {departments.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{d.name}</p>
                  {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">Head: {memberName(d.head_user_id)}</p>
                </div>
                {canManageOrgStructure && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(d)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(d)}>
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
