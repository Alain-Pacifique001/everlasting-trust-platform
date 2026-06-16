import { useEffect, useState, useCallback } from 'react';
import { Building, Users, User as UserIcon, Loader2, Network } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Department { id: string; name: string; head_user_id: string | null }
interface Team { id: string; name: string; department_id: string; manager_user_id: string | null }
interface Employee { id: string; user_id: string; team_id: string | null; department_id: string | null; job_title: string | null }
interface Profile { user_id: string; full_name: string | null; email: string | null }

export const OrgChart = () => {
  const { organization } = useOrganization();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const [{ data: ds }, { data: ts }, { data: emps }, { data: mems }] = await Promise.all([
      supabase.from('departments').select('id,name,head_user_id').eq('organization_id', organization.id).order('name'),
      supabase.from('teams').select('id,name,department_id,manager_user_id').eq('organization_id', organization.id).order('name'),
      supabase.from('employees').select('id,user_id,team_id,department_id,job_title').eq('organization_id', organization.id),
      supabase.from('organization_members').select('user_id').eq('organization_id', organization.id),
    ]);
    setDepartments((ds ?? []) as Department[]);
    setTeams((ts ?? []) as Team[]);
    setEmployees((emps ?? []) as Employee[]);
    const ids = Array.from(new Set([
      ...(mems ?? []).map((m: any) => m.user_id),
      ...(ds ?? []).map((d: any) => d.head_user_id).filter(Boolean),
      ...(ts ?? []).map((t: any) => t.manager_user_id).filter(Boolean),
    ]));
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', ids);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  }, [organization]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const name = (uid: string | null) => uid ? (profiles[uid]?.full_name?.trim() || profiles[uid]?.email || 'Unknown') : '—';

  if (!organization) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="w-4 h-4" /> Organization chart
        </CardTitle>
        <CardDescription>Live tree of departments, teams, and people.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-primary" />
                <p className="font-medium text-sm">{organization.name}</p>
              </div>
            </div>
            {departments.length === 0 && (
              <p className="text-sm text-muted-foreground pl-6">No departments yet.</p>
            )}
            {departments.map((d) => {
              const deptTeams = teams.filter((t) => t.department_id === d.id);
              const deptEmployees = employees.filter((e) => e.department_id === d.id && !e.team_id);
              return (
                <div key={d.id} className="ml-4 border-l border-border pl-4 space-y-2">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-muted-foreground" />
                      <p className="font-medium text-sm">{d.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Head: {name(d.head_user_id)}</p>
                  </div>
                  {deptTeams.map((t) => {
                    const teamEmployees = employees.filter((e) => e.team_id === t.id);
                    return (
                      <div key={t.id} className="ml-4 border-l border-border pl-4 space-y-1.5">
                        <div className="rounded-lg border border-border bg-card p-2.5">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <p className="text-sm">{t.name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">Manager: {name(t.manager_user_id)}</p>
                        </div>
                        {teamEmployees.map((emp) => (
                          <div key={emp.id} className="ml-4 border-l border-border pl-4">
                            <div className="rounded-md border border-dashed border-border p-2 flex items-center gap-2">
                              <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                              <p className="text-xs">{name(emp.user_id)}{emp.job_title ? <span className="text-muted-foreground"> — {emp.job_title}</span> : null}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {deptEmployees.map((emp) => (
                    <div key={emp.id} className="ml-4 border-l border-border pl-4">
                      <div className="rounded-md border border-dashed border-border p-2 flex items-center gap-2">
                        <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="text-xs">{name(emp.user_id)}{emp.job_title ? <span className="text-muted-foreground"> — {emp.job_title}</span> : null}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
