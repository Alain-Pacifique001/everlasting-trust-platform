import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Check, X, Copy, Users, ShieldCheck, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/components/ui/sonner';

interface MembershipRequest {
  id: string;
  user_id: string;
  status: string;
  message: string;
  created_at: string;
  reviewed_at: string | null;
}

interface ProfileLite {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

const StatusPill = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    approved: { label: 'Approved', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    rejected: { label: 'Rejected', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
    cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground border-border' },
  };
  const cfg = map[status] ?? map.pending;
  return <Badge variant="outline" className={cfg.cls}>{cfg.label}</Badge>;
};

export const MembershipRequests = () => {
  const { user } = useAuth();
  const { organization, role } = useOrganization();
  const [pending, setPending] = useState<MembershipRequest[]>([]);
  const [recent, setRecent] = useState<MembershipRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState<{ id: string; action: 'approved' | 'rejected'; name: string } | null>(null);

  const isAdmin = role === 'owner' || role === 'accountant';
  const isOwner = role === 'owner';

  const loadJoinCode = useCallback(async () => {
    if (!organization || role !== 'owner') return;
    const { data } = await supabase
      .from('organizations')
      .select('join_code')
      .eq('id', organization.id)
      .maybeSingle();
    if (data?.join_code) setCode(data.join_code);
  }, [organization, role]);

  const fetchRequests = useCallback(async () => {
    if (!organization || !isAdmin) { setLoading(false); return; }
    setLoading(true);
    const { data: all } = await supabase
      .from('membership_requests')
      .select('id, user_id, status, message, created_at, reviewed_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const list = (all ?? []) as MembershipRequest[];
    setPending(list.filter((r) => r.status === 'pending'));
    setRecent(list.filter((r) => r.status !== 'pending').slice(0, 10));

    const userIds = list.map((r) => r.user_id);
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);
      const map: Record<string, ProfileLite> = {};
      (profs ?? []).forEach((p) => { map[p.user_id] = p as ProfileLite; });
      setProfiles(map);
    } else {
      setProfiles({});
    }
    setLoading(false);
  }, [organization, isAdmin]);

  useEffect(() => {
    loadJoinCode();
    fetchRequests();
  }, [loadJoinCode, fetchRequests]);

  // Realtime updates for any request changes
  useEffect(() => {
    if (!organization || !isAdmin) return;
    const channel = supabase
      .channel('membership-requests-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'membership_requests', filter: `organization_id=eq.${organization.id}` },
        () => fetchRequests(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organization, isAdmin, fetchRequests]);

  const performAction = async (id: string, status: 'approved' | 'rejected') => {
    if (!user) return;
    setActing(id);
    const { error } = await supabase
      .from('membership_requests')
      .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', id);

    // Audit feedback
    if (!error) {
      const target = pending.find((r) => r.id === id);
      const name = target ? (profiles[target.user_id]?.full_name || profiles[target.user_id]?.email || 'user') : 'user';
      await supabase.from('settings_audit_log').insert({
        user_id: user.id,
        section: 'organization',
        changes: { action: status === 'approved' ? 'approved_member' : 'rejected_member', request_id: id, member: name } as any,
      });
    }

    setActing(null);
    if (error) { toast.error(error.message); return; }
    toast.success(status === 'approved' ? 'Member approved and added to organization' : 'Request rejected');
    fetchRequests();
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    toast.success('Join code copied');
  };

  if (!organization) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4" /> Organization access
        </CardTitle>
        <CardDescription>
          Share the join code with new members and review their requests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isOwner ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Join code (owner only)</p>
              <p className="text-lg font-mono font-semibold tracking-widest">{code || '—'}</p>
            </div>
            <Button size="sm" variant="outline" onClick={copyCode} disabled={!code}>
              <Copy className="w-4 h-4 mr-1" /> Copy
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            Only the organization owner can view or share the join code. Ask your owner to invite you.
          </div>
        )}

        {!isAdmin ? (
          <p className="text-sm text-muted-foreground">Only owners and accountants can review join requests.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading requests…
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending</p>
                <Badge variant="secondary">{pending.length}</Badge>
              </div>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending requests.</p>
              ) : (
                <div className="space-y-2">
                  {pending.map((req) => {
                    const p = profiles[req.user_id];
                    const name = p?.full_name || p?.email || 'Pending user';
                    return (
                      <div key={req.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{name}</p>
                            <StatusPill status={req.status} />
                          </div>
                          {p?.email && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                          {req.message && <p className="text-xs text-muted-foreground mt-1 italic">"{req.message}"</p>}
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {new Date(req.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => setConfirm({ id: req.id, action: 'approved', name })}
                            disabled={acting === req.id}
                            title="Approve"
                          >
                            {acting === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setConfirm({ id: req.id, action: 'rejected', name })}
                            disabled={acting === req.id}
                            title="Reject"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {recent.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent activity</p>
                <div className="space-y-1">
                  {recent.map((req) => {
                    const p = profiles[req.user_id];
                    return (
                      <div key={req.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/60 last:border-0">
                        <span className="truncate text-foreground">{p?.full_name || p?.email || 'User'}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground">{new Date(req.reviewed_at || req.created_at).toLocaleDateString()}</span>
                          <StatusPill status={req.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === 'approved' ? 'Approve membership request?' : 'Reject membership request?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === 'approved'
                ? `${confirm?.name} will gain access to your organization as a viewer. You can change their role later.`
                : `${confirm?.name} will not be able to access this organization. They can submit a new request later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirm) await performAction(confirm.id, confirm.action);
                setConfirm(null);
              }}
              className={confirm?.action === 'rejected' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {confirm?.action === 'approved' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
