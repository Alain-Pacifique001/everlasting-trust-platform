import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, UserCog, Trash2, Crown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization, AppRole } from '@/contexts/OrganizationContext';
import { toast } from '@/components/ui/sonner';

interface Member {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

interface ProfileLite {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

const ROLE_OPTIONS: AppRole[] = [
  'owner', 'ceo', 'cfo',
  'finance_manager', 'accounting_manager', 'hr_manager',
  'team_manager', 'accountant', 'analyst',
  'auditor', 'employee', 'viewer',
];

const roleColor: Record<AppRole, string> = {
  owner: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  ceo: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  cfo: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  finance_manager: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  accounting_manager: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  hr_manager: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  team_manager: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  accountant: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  analyst: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  auditor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  employee: 'bg-muted text-muted-foreground border-border',
  viewer: 'bg-muted text-muted-foreground border-border',
};

const roleLabel = (r: AppRole) => r.replace(/_/g, ' ');

export const UserManagementPanel = () => {
  const { user } = useAuth();
  const { organization, isOwner } = useOrganization();
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const { data: rows } = await supabase
      .from('organization_members')
      .select('id, user_id, role, created_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: true });
    const list = (rows ?? []) as Member[];
    setMembers(list);
    if (list.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', list.map((m) => m.user_id));
      const map: Record<string, ProfileLite> = {};
      (profs ?? []).forEach((p) => { map[p.user_id] = p as ProfileLite; });
      setProfiles(map);
    }
    setLoading(false);
  }, [organization]);

  useEffect(() => {
    if (isOwner) fetchMembers();
    else setLoading(false);
  }, [isOwner, fetchMembers]);

  const changeRole = async (member: Member, newRole: AppRole) => {
    if (member.role === newRole) return;
    setSavingId(member.id);
    const { error } = await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', member.id);
    setSavingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Role updated');
    if (user) {
      await supabase.from('settings_audit_log').insert({
        user_id: user.id,
        section: 'organization',
        changes: { action: 'role_changed', member_id: member.user_id, from: member.role, to: newRole } as any,
      });
    }
    fetchMembers();
  };

  const removeMember = async (member: Member) => {
    setSavingId(member.id);
    const { error } = await supabase.from('organization_members').delete().eq('id', member.id);
    setSavingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Member removed');
    if (user) {
      await supabase.from('settings_audit_log').insert({
        user_id: user.id,
        section: 'organization',
        changes: { action: 'member_removed', member_id: member.user_id } as any,
      });
    }
    fetchMembers();
  };

  if (!isOwner || !organization) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="w-4 h-4" /> User management
        </CardTitle>
        <CardDescription>Manage roles and permissions for everyone in your organization.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading members…
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const p = profiles[m.user_id];
              const hasName = !!p?.full_name?.trim();
              const name = hasName ? p!.full_name! : (p?.email || 'Pending profile');
              const subline = hasName ? (p?.email || 'No email on file') : (p?.email ? null : 'No email on file');
              const isSelf = m.user_id === user?.id;
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate">{name}</p>
                      {isSelf && <Badge variant="outline" className="text-xs">You</Badge>}
                      {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                      <Badge variant="outline" className={`${roleColor[m.role]} capitalize`}>{roleLabel(m.role)}</Badge>
                    </div>
                    {subline && <p className="text-xs text-muted-foreground truncate mt-0.5">{subline}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={m.role}
                      onValueChange={(v) => changeRole(m, v as AppRole)}
                      disabled={savingId === m.id || isSelf}
                    >
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize text-xs">{roleLabel(r)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setConfirmRemove({ id: m.id, name })}
                      disabled={savingId === m.id || isSelf}
                      title={isSelf ? 'You cannot remove yourself' : 'Remove member'}
                    >
                      {savingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll immediately lose access to the organization. They can request to rejoin later with a new code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmRemove) return;
                const target = members.find((m) => m.id === confirmRemove.id);
                if (target) await removeMember(target);
                setConfirmRemove(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
