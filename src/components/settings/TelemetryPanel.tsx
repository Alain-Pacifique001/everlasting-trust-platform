import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Row = {
  id: string;
  event_type: string;
  channel: string;
  latency_ms: number | null;
  user_id: string;
  created_at: string;
  metadata: any;
};

const EVENT_COLOR: Record<string, string> = {
  connect: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  subscribed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  disconnect: 'bg-destructive/15 text-destructive',
  reconnect: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  presence_sync: 'bg-primary/15 text-primary',
  typing_sent: 'bg-muted text-muted-foreground',
  typing_received: 'bg-muted text-muted-foreground',
  latency_probe: 'bg-primary/15 text-primary',
};

export default function TelemetryPanel() {
  const { organization, hasAnyRole } = useOrganization();
  const isAdmin = hasAnyRole(['owner', 'ceo']);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [windowMin, setWindowMin] = useState<string>('60');

  const load = async () => {
    if (!organization) return;
    setLoading(true);
    const since = new Date(Date.now() - parseInt(windowMin) * 60_000).toISOString();
    let q = supabase.from('presence_telemetry')
      .select('*')
      .eq('organization_id', organization.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (eventFilter !== 'all') q = q.eq('event_type', eventFilter);
    const { data } = await q;
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [organization, eventFilter, windowMin]);

  const stats = useMemo(() => {
    const latencies = rows.map((r) => r.latency_ms).filter((n): n is number => typeof n === 'number');
    const sum = latencies.reduce((a, b) => a + b, 0);
    const avg = latencies.length ? Math.round(sum / latencies.length) : 0;
    const max = latencies.length ? Math.max(...latencies) : 0;
    const drops = rows.filter((r) => r.event_type === 'disconnect').length;
    const recos = rows.filter((r) => r.event_type === 'reconnect').length;
    return { count: rows.length, avg, max, drops, recos };
  }, [rows]);

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Realtime Telemetry
        </CardTitle>
        <CardDescription>
          Live WebSocket presence and typing diagnostics for this organization. Use these signals to debug dropped updates under concurrent load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Events" value={stats.count} />
          <Stat label="Avg latency" value={`${stats.avg} ms`} />
          <Stat label="Max latency" value={`${stats.max} ms`} />
          <Stat label="Disconnects" value={stats.drops} />
          <Stat label="Reconnects" value={stats.recos} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={windowMin} onValueChange={setWindowMin}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="15">Last 15 min</SelectItem>
              <SelectItem value="60">Last hour</SelectItem>
              <SelectItem value="360">Last 6 hours</SelectItem>
              <SelectItem value="1440">Last 24 hours</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {['connect','disconnect','reconnect','subscribed','presence_sync','typing_sent','typing_received','latency_probe'].map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>

        <div className="rounded-md border overflow-x-auto max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">No telemetry events in this window yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleTimeString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={EVENT_COLOR[r.event_type] ?? ''}>{r.event_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.channel}</TableCell>
                    <TableCell className="text-right text-xs">
                      {r.latency_ms != null ? `${r.latency_ms} ms` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
