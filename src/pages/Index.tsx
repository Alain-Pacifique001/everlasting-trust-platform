import { useTranslation } from 'react-i18next';
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Eye, EyeOff } from 'lucide-react';
import FinanceStatCard from '@/components/dashboard/FinanceStatCard';
import SpendingChart from '@/components/dashboard/SpendingChart';
import RecentTransactions from '@/components/dashboard/RecentTransactions';
import TeamCollaboration from '@/components/dashboard/TeamCollaboration';
import VoiceBriefings from '@/components/dashboard/VoiceBriefings';
import { Button } from '@/components/ui/button';
import { usePreferences, maskValue } from '@/contexts/PreferencesContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';

const Index = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { preferences, notifications, setPreferences } = usePreferences();
  const show = preferences.showBalances;

  const toggleShow = async () => {
    if (!user) return;
    const next = { ...preferences, showBalances: !show };
    setPreferences(next);
    const { error } = await supabase.from('user_settings').upsert(
      { user_id: user.id, preferences: next as any, notifications: notifications as any },
      { onConflict: 'user_id' },
    );
    if (error) toast.error(error.message);
  };

  const stats = [
    { title: t('dashboard.totalBalance'), value: maskValue('$24,563.00', show), change: `+2.5% ${t('dashboard.fromLastMonth')}`, changeType: 'positive' as const, icon: Wallet },
    { title: t('dashboard.monthlyIncome'), value: maskValue('$5,350.00', show), change: `+$350 ${t('dashboard.fromLastMonth')}`, changeType: 'positive' as const, icon: TrendingUp },
    { title: t('dashboard.monthlySpending'), value: maskValue('$2,847.19', show), change: `-12% ${t('dashboard.fromLastMonth')}`, changeType: 'positive' as const, icon: TrendingDown },
    { title: t('dashboard.totalSavings'), value: maskValue('$8,420.00', show), change: `67% ${t('dashboard.ofGoal')}`, changeType: 'neutral' as const, icon: PiggyBank },
  ];

  return (
    <div className={preferences.compactView ? 'p-4 space-y-4' : 'p-6 space-y-6'}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('dashboard.welcome')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={toggleShow} className="shrink-0">
          {show ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
          {show ? t('dashboard.hideBalances') : t('dashboard.showBalances')}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <FinanceStatCard key={i} {...stat} index={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingChart />
        <RecentTransactions />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TeamCollaboration />
        </div>
        <VoiceBriefings />
      </div>
    </div>
  );
};

export default Index;
