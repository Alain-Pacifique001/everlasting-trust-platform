import { useEffect, useState, useCallback } from 'react';
import { Loader2, Pencil, UserCheck, UserX, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Employee {
  id: string;
  user_id: string;
  organization_id: string;
  department_id: string | null;
  team_id: string | null;
  reports_to: string | null;
  employee_code: string | null;
  job_title: string | null;
  hire_date: string | null;
  status: string;
  profile_completion: number;
}
interface Profile { user_id: string; full_name: string | null; email: string | null }
interface Member { user_id: string; role: string }
interface Dept { id: string; name: string }
interface Team { id: string; name: string; department_id: string }

const computeCompletion = (e: Partial<Employee>) => {
  const fields = [e.job_title, e.department_id, e.team_id, e.employee_code, e.hire_date];
  const filled = fields.filter((v) => !!v && String(v).trim() !== '').length;
  return Math.round((filled / fields.length) * 100);
};

export const EmployeesPanel = () => {
  const { user } = useAuth();
  const { organization, canManageEmployees, role } = useOrganization();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({
    user_id: '', employee_code: '', job_title: '', hire_date: '',
    department_id: '', team_id: '', reports_to: '', status: 'active',
  });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const [{ data: emps }, { data: mems }, { data: ds }, { data: ts }] = await Promise.all([
      supabase.from('employees').select('*').eq('organization_id', organization.id),
      supabase.from('organization_members').select('user_id, role').eq('organization_id', organization.id),
      supabase.from('departments').select('id,name').eq('organization_id', organization.id).order('name'),
      supabase.from('teams').select('id,name,department_id').eq('organization_id', organization.id).order('name'),
    ]);
    setEmployees((emps ?? []) as Employee[]);
    setMembers((mems ?? []) as Member[]);
    setDepartments((ds ?? []) as Dept[]);
    setTeams((ts ?? []) as Team[]);
    const ids = (mems ?? []).map((m: any) => m.user_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles').select('user_id, full_name, email').in('user_id', ids);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  }, [organization]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const profileName = (uid: string) => {
    const p = profiles[uid];
    return p?.full_name?.trim() || p?.email || 'Unknown';
  };

  const openEdit = (emp: Employee | null, presetUserId?: string) => {
    setEditing(emp);
    setForm({
      user_id: emp?.user_id ?? presetUserId ?? '',
      employee_code: emp?.employee_code ?? '',
      job_title: emp?.job_title ?? '',
      hire_date: emp?.hire_date ?? '',
      department_id: emp?.department_id ?? '',
      team_id: emp?.team_id ?? '',
      reports_to: emp?.reports_to ?? '',
      status: emp?.status ?? 'active',
    });
  };

  const close = () => setEditing(null);

  const save = async () => {
    if (!organization || !user) return;
    if (!form.user_id) { toast.error('Pick a user'); return; }
    setSaving(true);
    const payload: any = {
      organization_id: organization.id,
      user_id: form.user_id,
      employee_code: form.employee_code || null,
      job_title: form.job_title || null,
      hire_date: form.hire_date || null,
      department_id: form.department_id || null,
      team_id: form.team_id || null,
      reports_to: form.reports_to || null,
      status: form.status,
      profile_completion: computeCompletion(form as any),
    };
    const { error } = editing
      ? await supabase.from('employees').update(payload).eq('id', editing.id)
      : await supabase.from('employees').upsert(payload, { onConflict: 'organization_id,user_id' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? 'Employee updated' : 'Employee record created');
    close(); fetchAll();
  };

  if (!organization) return null;
  const teamsForDept = teams.filter((t) => !form.department_id || t.department_id === form.department_id);
  const employeeByUserId = (uid: string) => employees.find((e) => e.user_id === uid);
  const usersWithoutEmployee = members.filter((m) => !employeeByUserId(m.user_id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IdCard className="w-4 h-4" /> Employees
        </CardTitle>
        <CardDescription>
          Employee records link organization members to a department, team, and reporting line.
          {!canManageEmployees && role && ' You can edit only your own record.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {members.map((m) => {
                const emp = employeeByUserId(m.user_id);
                const isSelf = m.user_id === user?.id;
                const canEdit = canManageEmployees || isSelf;
                const completion = emp?.profile_completion ?? 0;
                return (
                  <div key={m.user_id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{profileName(m.user_id)}</p>
                        <Badge variant="outline" className="text-[10px] capitalize">{m.role.replace('_', ' ')}</Badge>
                        {emp?.status === 'inactive' && (
                          <Badge variant="outline" className="text-[10px] bg-muted">Inactive</Badge>
                        )}
                        {!emp && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">No record</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {emp?.job_title || '—'}
                        {emp?.department_id && <span> · {departments.find((d) => d.id === emp.department_id)?.name}</span>}
                        {emp?.team_id && <span> · {teams.find((t) => t.id === emp.team_id)?.name}</span>}
                      </div>
                      {emp && (
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={completion} className="h-1.5 flex-1 max-w-[160px]" />
                          <span className="text-[10px] text-muted-foreground">{completion}% complete</span>
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => openEdit(emp ?? null, m.user_id)}>
                        <Pencil className="w-4 h-4 mr-1" /> {emp ? 'Edit' : 'Add'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!editing || (!!form.user_id && !editing)} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit employee' : 'Add employee record'}</DialogTitle>
            <DialogDescription>{editing ? profileName(editing.user_id) : profileName(form.user_id)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Employee code</Label>
                <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} placeholder="EMP-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Hire date</Label>
                <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Job title</Label>
              <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="Senior Accountant" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={form.department_id || 'none'} onValueChange={(v) => setForm({ ...form, department_id: v === 'none' ? '' : v, team_id: '' })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Select value={form.team_id || 'none'} onValueChange={(v) => setForm({ ...form, team_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {teamsForDept.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reports to</Label>
              <Select value={form.reports_to || 'none'} onValueChange={(v) => setForm({ ...form, reports_to: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {employees.filter((e) => e.user_id !== form.user_id).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{profileName(e.user_id)}{e.job_title ? ` — ${e.job_title}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending verification</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
