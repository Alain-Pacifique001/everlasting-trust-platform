import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { month: 'Jan', spending: 1800 },
  { month: 'Feb', spending: 2200 },
  { month: 'Mar', spending: 1900 },
  { month: 'Apr', spending: 2847 },
  { month: 'May', spending: 2100 },
  { month: 'Jun', spending: 2400 },
];

const SpendingChart = () => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-card-foreground mb-4">
        {t('dashboard.spendingOverview')}
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorSpending" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              color: 'hsl(var(--card-foreground))',
            }}
          />
          <Area type="monotone" dataKey="spending" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSpending)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpendingChart;
