import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

export const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'RWF', symbol: 'FRw', label: 'Rwandan Franc' },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan' },
  { code: 'KES', symbol: 'KSh', label: 'Kenyan Shilling' },
  { code: 'NGN', symbol: '₦', label: 'Nigerian Naira' },
  { code: 'ZAR', symbol: 'R', label: 'South African Rand' },
] as const;

export type CurrencyCode = typeof CURRENCIES[number]['code'];

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => Promise<void>;
  rates: Record<string, number>; // 1 USD -> X CURRENCY
  convert: (usd: number) => number;
  format: (usd: number, opts?: { compact?: boolean }) => string;
  symbol: string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState<CurrencyCode>('USD');
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [loading, setLoading] = useState(true);

  // Load rates once
  useEffect(() => {
    fetch(`${SUPABASE_URL}/functions/v1/exchange-rates?base=USD`, { headers: { apikey: ANON } })
      .then(r => r.json())
      .then(json => { if (json.rates) setRates(json.rates); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Load user preferred currency
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('currency').eq('user_id', user.id).single().then(({ data }) => {
      if (data?.currency && CURRENCIES.some(c => c.code === data.currency)) {
        setCurrencyState(data.currency as CurrencyCode);
      }
    });
  }, [user]);

  const setCurrency = useCallback(async (c: CurrencyCode) => {
    setCurrencyState(c);
    if (user) {
      await supabase.from('profiles').update({ currency: c }).eq('user_id', user.id);
    }
  }, [user]);

  const rate = rates[currency] ?? 1;
  const meta = CURRENCIES.find(c => c.code === currency)!;

  const convert = useCallback((usd: number) => usd * rate, [rate]);

  const format = useCallback((usd: number, opts?: { compact?: boolean }) => {
    const value = usd * rate;
    const isRWF = currency === 'RWF';
    const fractionDigits = isRWF ? 0 : 2;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
        notation: opts?.compact ? 'compact' : 'standard',
      }).format(value);
    } catch {
      return `${meta.symbol}${value.toFixed(fractionDigits)}`;
    }
  }, [rate, currency, meta.symbol]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rates, convert, format, symbol: meta.symbol, loading }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider');
  return ctx;
};
