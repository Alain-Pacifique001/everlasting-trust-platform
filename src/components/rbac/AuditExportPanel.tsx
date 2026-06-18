import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, ClipboardList, RefreshCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/components/ui/sonner';

export interface ExportFilters {
  from_date?: string;
  to_date?: string;
  user_id?: string;
  role?: string;
  action_type?: string;
}

type Job = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  row_count: number | null;
  file_path: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  filters: Record<string, unknown>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

const STATUS_VARIANT: Record<Job['status'], any> = {
  queued: 'outline', running: 'secondary', completed: 'default', failed: 'destructive', cancelled: 'outline',
};

interface Props {
  filters: ExportFilters;
}

export default function AuditExportPanel({ filters }: Props) {
  const { organization } = useOrganization();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_export_jobs')
      .select('id,status,row_count,file_path,error,created_at,started_at,completed_at,filters')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) toast.error(`Failed to load jobs: ${error.message}`);
    setJobs((data ?? []) as Job[]);
    setLoading(false);
  }, [organization]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Realtime updates for jobs in this org
  useEffect(() => {
    if (!organization) return;
    const ch = supabase
      .channel(`export-jobs-${organization.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'audit_export_jobs', filter: `organization_id=eq.${organization.id}` },
        () => { fetchJobs(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [organization, fetchJobs]);

  // Poll while there's any in-flight job (in case realtime is unavailable)
  useEffect(() => {
    if (!jobs.some(j => j.status === 'queued' || j.status === 'running')) return;
    const t = setInterval(fetchJobs, 4000);
    return () => clearInterval(t);
  }, [jobs, fetchJobs]);

  const validate = (): string | null => {
    if (!organization) return 'No organization selected';
    if (filters.from_date && !ISO_DATE.test(filters.from_date)) return 'Invalid From date';
    if (filters.to_date && !ISO_DATE.test(filters.to_date)) return 'Invalid To date';
    if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) return 'From date must be before To date';
    return null;
  };

  const enqueueExport = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setCreating(true);
    try {
      const payload = {
        organization_id: organization!.id,
        from_date: filters.from_date || undefined,
        to_date: filters.to_date ? `${filters.to_date}T23:59:59Z` : undefined,
        user_id: filters.user_id || undefined,
        role: filters.role && filters.role !== 'all' ? filters.role : undefined,
        action_type: filters.action_type && filters.action_type !== 'all' ? filters.action_type : undefined,
        mode: 'queue',
      };
      const { data, error } = await supabase.functions.invoke('audit-export', { body: payload });
      if (error) throw error;
      toast.success('Export queued — we\'ll notify you when the CSV is ready.');
      if ((data as any)?.job_id) fetchJobs();
    } catch (e: any) {
      toast.error(`Export failed: ${e.message ?? 'Unknown error'}`);
    } finally {
      setCreating(false);
    }
  };

  const downloadJob = async (job: Job) => {
    if (!job.file_path) { toast.error('Export file not ready'); return; }
    const { data, error } = await supabase.storage.from('audit-exports').createSignedUrl(job.file_path, 60);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? 'Could not generate download link'); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = `audit-export-${job.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    await supabase.from('audit_export_jobs').update({ downloaded_at: new Date().toISOString() }).eq('id', job.id);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-4 h-4 text-primary" /> Export jobs
          </CardTitle>
          <CardDescription>Asynchronous CSV exports of the audit log. Status updates live; downloads stay available after refresh.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={enqueueExport} disabled={creating} className="gap-2">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No exports yet. Click <strong>Download CSV</strong> to start one.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Filters</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[j.status]} className="gap-1">
                        {(j.status === 'queued' || j.status === 'running') && <Loader2 className="w-3 h-3 animate-spin" />}
                        {j.status}
                      </Badge>
                      {j.error && <p className="text-[10px] text-destructive mt-1 max-w-xs truncate" title={j.error}>{j.error}</p>}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(j.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {j.completed_at ? new Date(j.completed_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{j.row_count ?? '—'}</TableCell>
                    <TableCell className="text-xs max-w-xs">
                      <code className="text-[10px] text-muted-foreground line-clamp-2">
                        {JSON.stringify(j.filters ?? {})}
                      </code>
                    </TableCell>
                    <TableCell className="text-right">
                      {j.status === 'completed' && j.file_path ? (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadJob(j)}>
                          <Download className="w-3.5 h-3.5" /> CSV
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
