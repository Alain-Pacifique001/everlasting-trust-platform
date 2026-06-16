import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Budget { id: number; category: string; limit: number; spent: number; }

const initialBudgets: Budget[] = [
  { id: 1, category: 'Food', limit: 800, spent: 540 },
  { id: 2, category: 'Transport', limit: 400, spent: 320 },
  { id: 3, category: 'Entertainment', limit: 200, spent: 180 },
  { id: 4, category: 'Utilities', limit: 300, spent: 250 },
  { id: 5, category: 'Shopping', limit: 500, spent: 120 },
];

const categoriesList = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Shopping', 'Health', 'Other'];

const Budgets = () => {
  const { t } = useTranslation();
  const [budgets, setBudgets] = useState(initialBudgets);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newBudget, setNewBudget] = useState({ category: 'Food', limit: '' });

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  const handleAdd = () => {
    if (!newBudget.limit) return;
    setBudgets((prev) => [...prev, { id: Date.now(), category: newBudget.category, limit: parseFloat(newBudget.limit), spent: 0 }]);
    setNewBudget({ category: 'Food', limit: '' });
    setDialogOpen(false);
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
            <Button><Plus className="w-4 h-4 mr-2" />{t('budgets.newBudget')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('budgets.createBudget')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={newBudget.category} onValueChange={(v) => setNewBudget((p) => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categoriesList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder={t('budgets.limit')} value={newBudget.limit} onChange={(e) => setNewBudget((p) => ({ ...p, limit: e.target.value }))} />
              <Button onClick={handleAdd} className="w-full">{t('budgets.create')}</Button>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {budgets.map((budget, i) => {
          const pct = Math.min((budget.spent / budget.limit) * 100, 100);
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
                <span className="text-sm text-muted-foreground">
                  ${budget.spent} {t('budgets.of')} ${budget.limit}
                </span>
              </div>
              <Progress value={pct} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">{pct.toFixed(0)}% {t('budgets.spent')}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default Budgets;
