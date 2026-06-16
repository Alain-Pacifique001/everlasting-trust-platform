import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

interface Holding {
  id: string; symbol: string; name: string; asset_type: string; shares: number; avg_price: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent-foreground))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const AnalyticsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { format, currency } = useCurrency();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('holdings').select('*');
    const list = data ?? [];
    setHoldings(list);
    if (list.length) {
      const symbols = list.map(h => h.symbol).join(',');
      const r = await fetch(`${SUPABASE_URL}/functions/v1/market-quotes?action=quotes&symbols=${encodeURIComponent(symbols)}`, {
        headers: { apikey: ANON },
      });
      const json = await r.json();
      const map: Record<string, number> = {};
      (json.quotes ?? []).forEach((q: any) => { map[q.symbol] = q.regularMarketPrice ?? 0; });
      setQuotes(map);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const enriched = holdings.map(h => {
    const price = quotes[h.symbol] ?? Number(h.avg_price);
    const value = price * Number(h.shares);
    const cost = Number(h.avg_price) * Number(h.shares);
    return { ...h, value, cost, gain: value - cost };
  });

  const totalValue = enriched.reduce((s, h) => s + h.value, 0);
  const totalCost = enriched.reduce((s, h) => s + h.cost, 0);
  const totalGain = totalValue - totalCost;

  const allocationData = enriched.map(h => ({
    name: h.symbol,
    value: h.value,
    pct: totalValue ? (h.value / totalValue) * 100 : 0,
  }));

  const byType = enriched.reduce((acc, h) => {
    acc[h.asset_type] = (acc[h.asset_type] ?? 0) + h.value;
    return acc;
  }, {} as Record<string, number>);
  const typeData = Object.entries(byType).map(([name, value]) => ({ name, value }));

  const performanceData = enriched.map(h => ({
    symbol: h.symbol,
    Cost: Math.round(h.cost),
    Value: Math.round(h.value),
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent"><BarChart3 className="w-6 h-6 text-accent-foreground" /></div>
        <div>
          <h1 className="text-2xl font-bold">{t('analytics.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('analytics.subtitle')}</p>
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">{t('common.loading')}</p> :
       holdings.length === 0 ? (
         <Card><CardContent className="py-12 text-center text-muted-foreground">
           {t('analytics.addHoldingsFirst')}
         </CardContent></Card>
       ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('analytics.totalValue')} ({currency})</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{format(totalValue)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('analytics.holdings')}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{holdings.length}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('analytics.totalReturn')}</CardTitle></CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${totalGain >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                  {totalGain >= 0 ? '+' : ''}{format(totalGain)}
                </p>
              </CardContent></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>{t('analytics.allocationByHolding')}</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocationData} dataKey="value" nameKey="name" outerRadius={90} label={(e: any) => `${e.name} ${Number(e.pct ?? 0).toFixed(0)}%`}>
                      {allocationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => format(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t('analytics.allocationByType')}</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="name" outerRadius={90} label={(e) => `${e.name}`}>
                      {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => format(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>{t('analytics.costVsValue')}</CardTitle></CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="symbol" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => format(v)} />
                  <Legend />
                  <Bar dataKey="Cost" fill="hsl(var(--muted-foreground))" />
                  <Bar dataKey="Value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;
