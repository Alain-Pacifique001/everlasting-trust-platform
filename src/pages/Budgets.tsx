import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

interface Budget { id: string; category: string; amount_limit: number; spent: number; }

const categoriesList = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Shopping', 'Health', 'Other'];

const Budgets = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organization, canEdit, isViewer } = useOrganization();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newBudget, setNewBudget] = useState({ category: 'Food', limit: '' });

  useEffect(() => {
    if (!organization) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('budgets')
        .select('id, category, amount_limit, spent')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) toast.error(error.message);
      else setBudgets((data ?? []).map((b: any) => ({ ...b, amount_limit: Number(b.amount_limit), spent: Number(b.spent) })));
      setLoading(false);
    })();
  }, [organization]);

  const totalBudget = budgets.reduce((s, b) => s + b.amount_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  const handleAdd = async () => {
    if (!newBudget.limit || !organization || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('budgets')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        category: newBudget.category,
        amount_limit: parseFloat(newBudget.limit),
      })
      .select('id, category, amount_limit, spent')
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setBudgets((prev) => [{ ...(data as any), amount_limit: Number(data!.amount_limit), spent: Number(data!.spent) }, ...prev]);
    setNewBudget({ category: 'Food', limit: '' });
    setDialogOpen(false);
    toast.success('Budget created');
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('budgets').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('budgets.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('budgets.subtitle')}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={isViewer}><Plus className="w-4 h-4 mr-2" />{t('budgets.newBudget')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('budgets.createBudget')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={newBudget.category} onValueChange={(v) => setNewBudget((p) => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categoriesList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder={t('budgets.limit')} value={newBudget.limit} onChange={(e) => setNewBudget((p) => ({ ...p, limit: e.target.value }))} />
              <Button onClick={handleAdd} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {t('budgets.create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{t('budgets.totalBudget')}</p>
          <p className="text-2xl font-bold text-card-foreground">${totalBudget.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{t('budgets.totalSpent')}</p>
          <p className="text-2xl font-bold text-card-foreground">${totalSpent.toLocaleString()}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : budgets.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">No budgets yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map((budget, i) => {
            const pct = budget.amount_limit > 0 ? Math.min((budget.spent / budget.amount_limit) * 100, 100) : 0;
            return (
              <motion.div
                key={budget.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-card-foreground">{budget.category}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      ${budget.spent} {t('budgets.of')} ${budget.amount_limit}
                    </span>
                    {canEdit && (
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(budget.id)} title="Delete">
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
                <Progress value={pct} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">{pct.toFixed(0)}% {t('budgets.spent')}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Budgets;
