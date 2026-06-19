import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, ClipboardList, RefreshCcw, X, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export interface ExportFilters {
  from_date?: string;
  to_date?: string;
  user_id?: string;
  role?: string;
  action_type?: string;
}

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
type Job = {
  id: string;
  status: JobStatus;
  row_count: number | null;
  file_path: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancellation_requested_at: string | null;
  filters: Record<string, unknown>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

const STATUS_VARIANT: Record<JobStatus, any> = {
  queued: 'outline',
  running: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

interface Props {
  filters: ExportFilters;
}

export default function AuditExportPanel({ filters }: Props) {
  const { t } = useTranslation();
  const { organization } = useOrganization();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // Track terminal-transition notifications so we don't fire repeatedly
  const [notified, setNotified] = useState<Record<string, JobStatus>>({});

  const fetchJobs = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('audit_export_jobs')
      .select('id,status,row_count,file_path,error,created_at,started_at,completed_at,cancellation_requested_at,filters')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) toast.error(t('audit_export.toast.loadFailed', { message: error.message }));
    setJobs((data ?? []) as Job[]);
    setLoading(false);
  }, [organization, t]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Realtime updates
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

  // Poll while there's any in-flight job
  useEffect(() => {
    if (!jobs.some(j => j.status === 'queued' || j.status === 'running')) return;
    const interval = setInterval(fetchJobs, 4000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  // Fire toasts on terminal status transitions
  useEffect(() => {
    setNotified((prev) => {
      const next = { ...prev };
      for (const j of jobs) {
        if (prev[j.id] === j.status) continue;
        if (j.status === 'completed') toast.success(t('audit_export.toast.completed'));
        else if (j.status === 'failed') toast.error(t('audit_export.toast.failed', { message: j.error ?? '' }));
        else if (j.status === 'cancelled' && prev[j.id]) toast.message(t('audit_export.toast.cancelled'));
        next[j.id] = j.status;
      }
      return next;
    });
  }, [jobs, t]);

  const validate = (): string | null => {
    if (!organization) return t('audit_export.toast.noOrg');
    if (filters.from_date && !ISO_DATE.test(filters.from_date)) return t('audit_export.toast.invalidFrom');
    if (filters.to_date && !ISO_DATE.test(filters.to_date)) return t('audit_export.toast.invalidTo');
    if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) return t('audit_export.toast.invalidRange');
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
      toast.success(t('audit_export.toast.started'));
      if ((data as any)?.job_id) fetchJobs();
    } catch (e: any) {
      toast.error(t('audit_export.toast.failed', { message: e.message ?? 'Unknown error' }));
    } finally {
      setCreating(false);
    }
  };

  const cancelJob = async (job: Job) => {
    if (!organization) return;
    if (!window.confirm(t('audit_export.action.confirmCancel'))) return;
    setCancellingId(job.id);
    try {
      const { error } = await supabase.functions.invoke('audit-export', {
        body: { mode: 'cancel', organization_id: organization.id, job_id: job.id },
      });
      if (error) throw error;
      toast.message(t('audit_export.toast.cancelled'));
      fetchJobs();
    } catch (e: any) {
      toast.error(t('audit_export.toast.cancelError', { message: e.message ?? '' }));
    } finally {
      setCancellingId(null);
    }
  };

  const downloadJob = async (job: Job) => {
    if (!job.file_path) { toast.error(t('audit_export.toast.notReady')); return; }
    const { data, error } = await supabase.storage.from('audit-exports').createSignedUrl(job.file_path, 60);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? t('audit_export.toast.downloadError')); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = `audit-export-${job.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    await (supabase as any).from('audit_export_jobs').update({ downloaded_at: new Date().toISOString() }).eq('id', job.id);
  };

  const renderStatusIcon = (s: JobStatus) => {
    if (s === 'queued' || s === 'running') return <Loader2 className="w-3 h-3 animate-spin" />;
    if (s === 'completed') return <CheckCircle2 className="w-3 h-3" />;
    if (s === 'failed') return <XCircle className="w-3 h-3" />;
    if (s === 'cancelled') return <AlertCircle className="w-3 h-3" />;
    return null;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-4 h-4 text-primary" /> {t('audit_export.title')}
          </CardTitle>
          <CardDescription>{t('audit_export.description')}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading} aria-label={t('audit_export.refresh')}>
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={enqueueExport} disabled={creating} className="gap-2" data-testid="export-download-csv">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {t('audit_export.downloadCsv')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6" data-testid="export-empty">{t('audit_export.empty')}</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('audit_export.columns.status')}</TableHead>
                  <TableHead>{t('audit_export.columns.requested')}</TableHead>
                  <TableHead>{t('audit_export.columns.completed')}</TableHead>
                  <TableHead>{t('audit_export.columns.rows')}</TableHead>
                  <TableHead>{t('audit_export.columns.filters')}</TableHead>
                  <TableHead className="text-right">{t('audit_export.columns.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => {
                  const isCancelling = j.status === 'running' && j.cancellation_requested_at;
                  const displayStatus: JobStatus = j.status;
                  const canCancel = j.status === 'queued' || j.status === 'running';
                  return (
                    <TableRow key={j.id} data-testid={`export-job-${j.id}`} data-status={j.status}>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[displayStatus]} className="gap-1">
                          {renderStatusIcon(displayStatus)}
                          {isCancelling ? t('audit_export.status.cancelling') : t(`audit_export.status.${displayStatus}`)}
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
                        <div className="flex justify-end gap-1">
                          {j.status === 'completed' && j.file_path && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadJob(j)} data-testid="export-download-link">
                              <Download className="w-3.5 h-3.5" /> {t('audit_export.action.download')}
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-destructive"
                              onClick={() => cancelJob(j)}
                              disabled={cancellingId === j.id}
                              data-testid="export-cancel"
                            >
                              {cancellingId === j.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              {t('audit_export.action.cancel')}
                            </Button>
                          )}
                          {!canCancel && j.status !== 'completed' && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
