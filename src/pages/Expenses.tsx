import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Search, ArrowUpRight, ArrowDownLeft, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  type: 'expense' | 'income';
}

const categories = ['Food', 'Transport', 'Entertainment', 'Utilities', 'Health', 'Shopping', 'Income', 'Other'];

const Expenses = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organization, isViewer, canEdit } = useOrganization();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newExpense, setNewExpense] = useState<{ name: string; category: string; amount: string; type: 'expense' | 'income' }>({ name: '', category: 'Food', amount: '', type: 'expense' });

  useEffect(() => {
    if (!organization) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('expenses')
        .select('id, name, category, amount, date, type')
        .eq('organization_id', organization.id)
        .order('date', { ascending: false });
      if (error) toast.error(error.message);
      else setExpenses((data ?? []).map((d: any) => ({ ...d, amount: Number(d.amount) })));
      setLoading(false);
    })();
  }, [organization]);

  const filtered = expenses.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || e.category === filter;
    return matchSearch && matchFilter;
  });

  const handleAdd = async () => {
    if (!newExpense.name || !newExpense.amount || !organization || !user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        name: newExpense.name,
        category: newExpense.category,
        amount: parseFloat(newExpense.amount),
        type: newExpense.type,
        date: new Date().toISOString().slice(0, 10),
      })
      .select('id, name, category, amount, date, type')
      .single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setExpenses((prev) => [{ ...(data as any), amount: Number(data!.amount) }, ...prev]);
    setNewExpense({ name: '', category: 'Food', amount: '', type: 'expense' });
    setDialogOpen(false);
    toast.success('Saved');
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
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
              <Button onClick={handleAdd} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {t('expenses.add')}
              </Button>
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

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">No expenses yet.</p>
      ) : (
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
              <div className="flex items-center gap-3">
                <p className={`font-semibold ${expense.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {expense.type === 'income' ? '+' : '-'}${expense.amount.toFixed(2)}
                </p>
                {canEdit && (
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(expense.id)} title="Delete">
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Expenses;
