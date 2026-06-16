import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { Plus, CheckCircle2, Circle, Clock, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  due_date: string | null;
  status: string;
  priority: string;
  assigned_to: string;
  created_by: string;
  completed_at: string | null;
  created_at: string;
}

interface Member {
  user_id: string;
  role: string;
  full_name?: string;
  email?: string;
}

const statusColor: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  cancelled: 'bg-destructive/10 text-destructive',
};

const priorityColor: Record<string, string> = {
  low: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  high: 'bg-destructive/10 text-destructive',
};

const TasksPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organization, role, canManageTasks, loading: orgLoading } = useOrganization();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');

  // form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('budget');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    if (!organization) return;
    setLoading(true);
    const [{ data: taskData }, { data: memberData }] = await Promise.all([
      supabase.from('tasks').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }),
      supabase.from('organization_members').select('user_id, role').eq('organization_id', organization.id),
    ]);
    setTasks((taskData as Task[]) ?? []);

    const memberList = (memberData ?? []) as Member[];
    if (memberList.length) {
      const ids = memberList.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', ids);
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      setMembers(
        memberList.map((m) => ({
          ...m,
          full_name: profileMap.get(m.user_id)?.full_name,
          email: profileMap.get(m.user_id)?.email,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    if (organization) loadData();
  }, [organization]);

  const memberLabel = (uid: string) => {
    const m = members.find((x) => x.user_id === uid);
    return m?.full_name || m?.email || uid.slice(0, 8);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !organization) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        organization_id: organization.id,
        title,
        description,
        category,
        amount: amount ? Number(amount) : 0,
        due_date: dueDate || null,
        priority,
        assigned_to: assignedTo || user.id,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success(t('tasks.created'));
      setOpen(false);
      setTitle(''); setDescription(''); setAmount(''); setDueDate(''); setAssignedTo('');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (task: Task, newStatus: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', task.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t('tasks.updated'));
      loadData();
    }
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success(t('tasks.deleted')); loadData(); }
  };

  if (orgLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const visibleTasks = filter === 'mine' ? tasks.filter((tk) => tk.assigned_to === user?.id) : tasks;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('tasks.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {organization?.name} · {t(`org.types.${organization?.type ?? 'company'}` as any, { defaultValue: organization?.type })} · {t(`roles.${role}`)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tasks.filterAll')}</SelectItem>
              <SelectItem value="mine">{t('tasks.filterMine')}</SelectItem>
            </SelectContent>
          </Select>
          {canManageTasks && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-1" />{t('tasks.new')}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{t('tasks.newTitle')}</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{t('tasks.fields.title')}</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('tasks.fields.description')}</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t('tasks.fields.category')}</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="budget">{t('tasks.categories.budget')}</SelectItem>
                          <SelectItem value="reconciliation">{t('tasks.categories.reconciliation')}</SelectItem>
                          <SelectItem value="report">{t('tasks.categories.report')}</SelectItem>
                          <SelectItem value="audit">{t('tasks.categories.audit')}</SelectItem>
                          <SelectItem value="investment">{t('tasks.categories.investment')}</SelectItem>
                          <SelectItem value="general">{t('tasks.categories.general')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('tasks.fields.priority')}</Label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{t('tasks.priorities.low')}</SelectItem>
                          <SelectItem value="medium">{t('tasks.priorities.medium')}</SelectItem>
                          <SelectItem value="high">{t('tasks.priorities.high')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('tasks.fields.amount')}</Label>
                      <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('tasks.fields.dueDate')}</Label>
                      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('tasks.fields.assignTo')}</Label>
                    <Select value={assignedTo} onValueChange={setAssignedTo}>
                      <SelectTrigger><SelectValue placeholder={t('tasks.fields.assignToPlaceholder')} /></SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {memberLabel(m.user_id)} · {t(`roles.${m.role}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={submitting}>
                      {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {t('tasks.create')}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : visibleTasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t('tasks.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {visibleTasks.map((task) => {
            const isMine = task.assigned_to === user?.id;
            const canEdit = isMine || canManageTasks;
            return (
              <Card key={task.id} className={cn('transition-shadow hover:shadow-md', task.status === 'completed' && 'opacity-70')}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        onClick={() => canEdit && updateStatus(task, task.status === 'completed' ? 'pending' : 'completed')}
                        disabled={!canEdit}
                        className="mt-0.5 disabled:cursor-not-allowed"
                      >
                        {task.status === 'completed'
                          ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                          : task.status === 'in_progress'
                          ? <Clock className="w-5 h-5 text-primary" />
                          : <Circle className="w-5 h-5 text-muted-foreground" />}
                      </button>
                      <div className="min-w-0">
                        <CardTitle className={cn('text-base', task.status === 'completed' && 'line-through')}>
                          {task.title}
                        </CardTitle>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                      </div>
                    </div>
                    {canManageTasks && (
                      <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" className={statusColor[task.status]}>{t(`tasks.status.${task.status}`)}</Badge>
                    <Badge variant="secondary" className={priorityColor[task.priority]}>{t(`tasks.priorities.${task.priority}`)}</Badge>
                    <Badge variant="outline">{t(`tasks.categories.${task.category}`, { defaultValue: task.category })}</Badge>
                    {task.amount > 0 && (
                      <span className="text-muted-foreground">
                        {task.currency} {Number(task.amount).toLocaleString()}
                      </span>
                    )}
                    {task.due_date && (
                      <span className="text-muted-foreground">📅 {new Date(task.due_date).toLocaleDateString()}</span>
                    )}
                    <span className="text-muted-foreground ml-auto">→ {memberLabel(task.assigned_to)}</span>
                  </div>
                  {canEdit && task.status !== 'completed' && (
                    <div className="flex gap-2 mt-3">
                      {task.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(task, 'in_progress')}>
                          {t('tasks.actions.start')}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => updateStatus(task, 'completed')}>
                        {t('tasks.actions.complete')}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TasksPage;
