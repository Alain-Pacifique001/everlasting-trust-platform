import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

interface SavingsGoal { id: string; name: string; target_amount: number; saved_amount: number; icon: string; }

const Savings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organization, canEdit, isViewer } = useOrganization();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: '', target: '' });

  useEffect(() => {
    if (!organization) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('savings_goals')
        .select('id, name, target_amount, saved_amount, icon')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) toast.error(error.message);
      else setGoals((data ?? []).map((g: any) => ({ ...g, target_amount: Number(g.target_amount), saved_amount: Number(g.saved_amount) })));
      setLoading(false);
    })();
  }, [organization]);

  const totalSaved = goals.reduce((s, g) => s + g.saved_amount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);

  const handleAdd = async () => {
    if (!newGoal.name || !newGoal.target || !organization || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('savings_goals')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        name: newGoal.name,
        target_amount: parseFloat(newGoal.target),
        icon: '🎯',
      })
      .select('id, name, target_amount, saved_amount, icon')
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setGoals((prev) => [{ ...(data as any), target_amount: Number(data!.target_amount), saved_amount: Number(data!.saved_amount) }, ...prev]);
    setNewGoal({ name: '', target: '' });
    setDialogOpen(false);
    toast.success('Goal created');
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('savings_goals').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('savings.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('savings.subtitle')}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={isViewer}><Plus className="w-4 h-4 mr-2" />{t('savings.newGoal')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('savings.createGoal')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={t('savings.goalName')} value={newGoal.name} onChange={(e) => setNewGoal((p) => ({ ...p, name: e.target.value }))} />
              <Input type="number" placeholder={t('savings.targetAmount')} value={newGoal.target} onChange={(e) => setNewGoal((p) => ({ ...p, target: e.target.value }))} />
              <Button onClick={handleAdd} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {t('savings.create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">{t('savings.totalSaved')}</p>
        <p className="text-2xl font-bold text-card-foreground">${totalSaved.toLocaleString()} / ${totalTarget.toLocaleString()}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : goals.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">No savings goals yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal, i) => {
            const pct = goal.target_amount > 0 ? Math.min((goal.saved_amount / goal.target_amount) * 100, 100) : 0;
            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{goal.icon}</span>
                    <div>
                      <h3 className="font-semibold text-card-foreground">{goal.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        ${goal.saved_amount.toLocaleString()} {t('savings.of')} ${goal.target_amount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(goal.id)} title="Delete">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{pct.toFixed(0)}% {t('savings.saved')}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Savings;
