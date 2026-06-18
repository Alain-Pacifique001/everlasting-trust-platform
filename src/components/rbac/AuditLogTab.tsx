import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuditLog } from '@/hooks/useRbac';
import AuditExportPanel from './AuditExportPanel';

const PAGE_SIZE = 25;
const EVENTS = ['all', 'role.create', 'role.rename', 'role.delete', 'permissions.update', 'user.role_change'];

const eventBadge = (e: string) => {
  if (e.startsWith('role.create')) return 'default';
  if (e.startsWith('role.delete')) return 'destructive';
  if (e.startsWith('permissions')) return 'secondary';
  return 'outline';
};

export default function AuditLogTab() {
  const [event, setEvent] = useState('all');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const filters = useMemo(
    () => ({ event, actor, from: from || undefined, to: to ? `${to}T23:59:59` : undefined, page, pageSize: PAGE_SIZE }),
    [event, actor, from, to, page],
  );
  const { rows, count, loading } = useAuditLog(filters);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-4">
    <AuditExportPanel filters={{
      from_date: from || undefined,
      to_date: to || undefined,
      action_type: event !== 'all' ? event : undefined,
    }} />
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4 text-primary" /> Audit log
          </CardTitle>
          <CardDescription>Every role and permission change, with actor and IP address.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Event</Label>
            <Select value={event} onValueChange={(v) => { setEvent(v); setPage(0); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENTS.map((e) => <SelectItem key={e} value={e}>{e === 'all' ? 'All events' : e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Actor email</Label>
            <Input className="h-9" value={actor} onChange={(e) => { setActor(e.target.value); setPage(0); }} placeholder="Search…" />
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" className="h-9" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" className="h-9" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No audit entries match.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={eventBadge(r.event_type) as any}>{r.event_type}</Badge></TableCell>
                    <TableCell className="text-xs">{r.actor_email ?? r.actor_user_id?.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">
                      {r.target_role && <div>role: {r.target_role}</div>}
                      {r.target_user_id && <div className="font-mono">{r.target_user_id.slice(0, 8)}</div>}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{r.ip_address ?? '—'}</TableCell>
                    <TableCell className="text-xs max-w-xs">
                      <pre className="whitespace-pre-wrap font-mono text-[10px] text-muted-foreground line-clamp-3">
                        {JSON.stringify(r.new_value ?? r.previous_value ?? {}, null, 0).slice(0, 200)}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{count} entries • page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
