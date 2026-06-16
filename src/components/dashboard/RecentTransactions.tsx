import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';

const transactions = [
  { id: 1, name: 'Grocery Store', amount: -85.20, date: '2026-03-27', type: 'expense' },
  { id: 2, name: 'Salary', amount: 4500.00, date: '2026-03-26', type: 'income' },
  { id: 3, name: 'Netflix', amount: -15.99, date: '2026-03-25', type: 'expense' },
  { id: 4, name: 'Electric Bill', amount: -120.00, date: '2026-03-24', type: 'expense' },
  { id: 5, name: 'Freelance Work', amount: 850.00, date: '2026-03-23', type: 'income' },
];

const RecentTransactions = () => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">
        {t('dashboard.recentTransactions')}
      </h3>
      <div className="space-y-3">
        {transactions.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${tx.type === 'income' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                {tx.type === 'income' ? (
                  <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-red-500" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-card-foreground">{tx.name}</p>
                <p className="text-xs text-muted-foreground">{tx.date}</p>
              </div>
            </div>
            <p className={`text-sm font-semibold ${tx.amount > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentTransactions;
