import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { Loader2, Check, X, History } from 'lucide-react';

type RoleRequest = {
  id: string;
  user_id: string;
  organization_id: string;
  requested_role: string;
  status: string;
  reason: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const RoleRequestsPage = () => {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    if (!organization) return;
    setLoading(true);
    const [reqRes, histRes] = await Promise.all([
      (supabase as any).from('role_requests').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }),
      (supabase as any).from('role_change_history').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }).limit(100),
    ]);
    setRequests(reqRes.data ?? []);
    setHistory(histRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [organization?.id]);

  const decide = async (req: RoleRequest, status: 'approved' | 'rejected') => {
    setActing(req.id);
    const { error } = await (supabase as any)
      .from('role_requests')
      .update({ status, reviewer_id: user?.id, reviewer_note: reviewNote[req.id] ?? null })
      .eq('id', req.id);
    setActing(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Request ${status}`);
    load();
  };

  const pending = requests.filter(r => r.status === 'pending');
  const decided = requests.filter(r => r.status !== 'pending');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Role requests</h1>
        <p className="text-sm text-muted-foreground">Approve or reject role requests from new members.</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="decided">Decided ({decided.length})</TabsTrigger>
          <TabsTrigger value="history">Change history</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> :
            pending.length === 0 ? <p className="text-sm text-muted-foreground">No pending requests.</p> :
            pending.map(req => (
              <Card key={req.id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{req.requested_role}</span>
                    <Badge variant="outline">{new Date(req.created_at).toLocaleString()}</Badge>
                  </CardTitle>
                  <CardDescription>User: {req.user_id} · {req.reason ?? '—'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    placeholder="Optional review note"
                    value={reviewNote[req.id] ?? ''}
                    onChange={e => setReviewNote(s => ({ ...s, [req.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => decide(req, 'approved')} disabled={acting === req.id}>
                      <Check className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button variant="destructive" onClick={() => decide(req, 'rejected')} disabled={acting === req.id}>
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          }
        </TabsContent>

        <TabsContent value="decided" className="space-y-2 mt-4">
          {decided.map(r => (
            <Card key={r.id}>
              <CardContent className="py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{r.requested_role}</span>
                  <span className="text-muted-foreground"> — {r.user_id}</span>
                </div>
                <Badge variant={r.status === 'approved' ? 'default' : 'destructive'}>{r.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-2 mt-4">
          {history.map(h => (
            <Card key={h.id}>
              <CardContent className="py-3 text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{h.action}</span>
                  <span className="text-muted-foreground">{h.previous_role ?? '∅'} → {h.new_role ?? '∅'}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RoleRequestsPage;
