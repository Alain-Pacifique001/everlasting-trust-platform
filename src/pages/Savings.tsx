import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface SavingsGoal { id: number; name: string; target: number; saved: number; icon: string; }

const initialGoals: SavingsGoal[] = [
  { id: 1, name: 'Emergency Fund', target: 10000, saved: 6700, icon: '🛡️' },
  { id: 2, name: 'Vacation', target: 3000, saved: 1200, icon: '✈️' },
  { id: 3, name: 'New Laptop', target: 2000, saved: 1800, icon: '💻' },
  { id: 4, name: 'Car Down Payment', target: 5000, saved: 720, icon: '🚗' },
];

const Savings = () => {
  const { t } = useTranslation();
  const [goals, setGoals] = useState(initialGoals);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: '', target: '' });

  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);

  const handleAdd = () => {
    if (!newGoal.name || !newGoal.target) return;
    setGoals((prev) => [...prev, { id: Date.now(), name: newGoal.name, target: parseFloat(newGoal.target), saved: 0, icon: '🎯' }]);
    setNewGoal({ name: '', target: '' });
    setDialogOpen(false);
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
            <Button><Plus className="w-4 h-4 mr-2" />{t('savings.newGoal')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('savings.createGoal')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={t('savings.goalName')} value={newGoal.name} onChange={(e) => setNewGoal((p) => ({ ...p, name: e.target.value }))} />
              <Input type="number" placeholder={t('savings.targetAmount')} value={newGoal.target} onChange={(e) => setNewGoal((p) => ({ ...p, target: e.target.value }))} />
              <Button onClick={handleAdd} className="w-full">{t('savings.create')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">{t('savings.totalSaved')}</p>
        <p className="text-2xl font-bold text-card-foreground">${totalSaved.toLocaleString()} / ${totalTarget.toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.map((goal, i) => {
          const pct = Math.min((goal.saved / goal.target) * 100, 100);
          return (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{goal.icon}</span>
                <div>
                  <h3 className="font-semibold text-card-foreground">{goal.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    ${goal.saved.toLocaleString()} {t('savings.of')} ${goal.target.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{pct.toFixed(0)}% {t('savings.saved')}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default Savings;
