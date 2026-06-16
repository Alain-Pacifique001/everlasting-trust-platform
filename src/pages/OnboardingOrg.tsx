import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { Loader2, Building2, Users, Clock, CheckCircle2, XCircle, LogOut } from 'lucide-react';

interface PendingRequest {
  id: string;
  status: string;
  created_at: string;
  organization_id: string;
  message: string;
  organizations?: { name: string; type: string } | null;
}

const OnboardingOrg = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { refresh } = useOrganization();

  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('membership_requests')
      .select('id, status, created_at, organization_id, message, organizations(name, type)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setPending((data ?? []) as PendingRequest[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime: listen for status changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('membership-requests-self')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'membership_requests', filter: `user_id=eq.${user.id}` },
        async (payload: any) => {
          if (payload.new?.status === 'approved') {
            toast.success('Your membership was approved!');
            await refresh();
            navigate('/dashboard');
          } else {
            fetchRequests();
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refresh, navigate, fetchRequests]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      toast.error('Enter a valid join code');
      return;
    }
    setSubmitting(true);
    try {
      const { data: orgs, error: lookupErr } = await supabase.rpc('find_org_by_code', { _code: trimmed });
      if (lookupErr) throw lookupErr;
      if (!orgs || orgs.length === 0) {
        toast.error('No organization found with that code');
        setSubmitting(false);
        return;
      }
      const org = orgs[0];
      const { error } = await supabase.from('membership_requests').insert({
        user_id: user.id,
        organization_id: org.id,
        message: message.trim(),
        status: 'pending',
      });
      if (error) {
        if (error.code === '23505') {
          toast.error('You already have a request for this organization');
        } else {
          throw error;
        }
      } else {
        toast.success(`Request sent to ${org.name}`);
        setCode('');
        setMessage('');
        fetchRequests();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    const { error } = await supabase
      .from('membership_requests')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Request cancelled');
    fetchRequests();
  };

  const statusBadge = (status: string) => {
    if (status === 'pending') return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
    if (status === 'approved') return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1"><CheckCircle2 className="w-3 h-3" />Approved</Badge>;
    if (status === 'rejected') return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Rejected</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  const hasActivePending = pending.some((p) => p.status === 'pending');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-4">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Join your organization</CardTitle>
            <CardDescription>
              Ask your organization admin for the join code, then enter it below to request access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasActivePending && (
              <Alert className="mb-4">
                <Clock className="w-4 h-4" />
                <AlertTitle>Awaiting approval</AlertTitle>
                <AlertDescription>
                  Your membership request is pending. You'll get full access as soon as an admin approves it.
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Organization join code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="e.g. A4K9PXR2"
                  maxLength={12}
                  className="font-mono tracking-widest text-center"
                  required
                />
                <p className="text-xs text-muted-foreground">8-character code provided by your organization admin.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message (optional)</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell the admin who you are…"
                  rows={2}
                  maxLength={300}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !code.trim()}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Users className="mr-2 h-4 w-4" />
                Request access
              </Button>
            </form>
          </CardContent>
        </Card>

        {loading ? null : pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pending.map((req) => (
                <div key={req.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {req.organizations?.name ?? 'Organization'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {statusBadge(req.status)}
                    {req.status === 'pending' && (
                      <Button size="sm" variant="ghost" onClick={() => handleCancel(req.id)}>Cancel</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Button type="button" variant="ghost" className="w-full" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          {t('nav.signOut')}
        </Button>
      </div>
    </div>
  );
};

export default OnboardingOrg;
