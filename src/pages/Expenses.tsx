import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Search, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/contexts/OrganizationContext';

interface Expense {
  id: number;
  name: string;
  category: string;
  amount: number;
  date: string;
  type: 'expense' | 'income';
}

const initialExpenses: Expense[] = [
  { id: 1, name: 'Grocery Store', category: 'Food', amount: 85.20, date: '2026-03-27', type: 'expense' },
  { id: 2, name: 'Salary', category: 'Income', amount: 4500.00, date: '2026-03-26', type: 'income' },
  { id: 3, name: 'Netflix', category: 'Entertainment', amount: 15.99, date: '2026-03-25', type: 'expense' },
  { id: 4, name: 'Electric Bill', category: 'Utilities', amount: 120.00, date: '2026-03-24', type: 'expense' },
  { id: 5, name: 'Freelance Work', category: 'Income', amount: 850.00, date: '2026-03-23', type: 'income' },
  { id: 6, name: 'Gas Station', category: 'Transport', amount: 45.00, date: '2026-03-22', type: 'expense' },
];

const categories = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Health', 'Shopping', 'Income', 'Other'];

const Expenses = () => {
  const { t } = useTranslation();
  const { isViewer } = useOrganization();
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newExpense, setNewExpense] = useState<{ name: string; category: string; amount: string; type: 'expense' | 'income' }>({ name: '', category: 'Food', amount: '', type: 'expense' });

  const filtered = expenses.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || e.category === filter;
    return matchSearch && matchFilter;
  });

  const handleAdd = () => {
    if (!newExpense.name || !newExpense.amount) return;
    setExpenses((prev) => [
      { id: Date.now(), name: newExpense.name, category: newExpense.category, amount: parseFloat(newExpense.amount), date: new Date().toISOString().slice(0, 10), type: newExpense.type },
      ...prev,
    ]);
    setNewExpense({ name: '', category: 'Food', amount: '', type: 'expense' });
    setDialogOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('expenses.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('expenses.subtitle')}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={isViewer} title={isViewer ? 'Viewers cannot add expenses' : undefined}>
              <Plus className="w-4 h-4 mr-2" />{t('expenses.addExpense')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('expenses.addExpense')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={t('expenses.name')} value={newExpense.name} onChange={(e) => setNewExpense((p) => ({ ...p, name: e.target.value }))} />
              <Select value={newExpense.category} onValueChange={(v) => setNewExpense((p) => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder={t('expenses.amount')} value={newExpense.amount} onChange={(e) => setNewExpense((p) => ({ ...p, amount: e.target.value }))} />
              <Select value={newExpense.type} onValueChange={(v: 'expense' | 'income') => setNewExpense((p) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">{t('expenses.expense')}</SelectItem>
                  <SelectItem value="income">{t('expenses.income')}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} className="w-full">{t('expenses.add')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t('expenses.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('expenses.all')}</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.map((expense, i) => (
          <motion.div
            key={expense.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${expense.type === 'income' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                {expense.type === 'income' ? <ArrowDownLeft className="w-4 h-4 text-emerald-500" /> : <ArrowUpRight className="w-4 h-4 text-red-500" />}
              </div>
              <div>
                <p className="text-sm font-medium text-card-foreground">{expense.name}</p>
                <p className="text-xs text-muted-foreground">{expense.category} · {expense.date}</p>
              </div>
            </div>
            <p className={`font-semibold ${expense.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
              {expense.type === 'income' ? '+' : '-'}${expense.amount.toFixed(2)}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Expenses;
