// Fetch real-time quotes via Yahoo Finance public endpoint (no API key required)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Quote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  currency?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "quotes";

    if (action === "search") {
      const q = url.searchParams.get("q") ?? "";
      if (!q) return json({ results: [] });
      const r = await fetch(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
        { headers: { "User-Agent": "Mozilla/5.0" } }
      );
      const data = await r.json();
      const results = (data.quotes ?? [])
        .filter((x: any) => x.symbol)
        .map((x: any) => ({
          symbol: x.symbol,
          name: x.shortname ?? x.longname ?? x.symbol,
          exchange: x.exchange,
          type: x.quoteType,
        }));
      return json({ results });
    }

    // quotes action
    const symbolsParam = url.searchParams.get("symbols") ?? "";
    const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (symbols.length === 0) return json({ quotes: [] });

    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!r.ok) {
      // Fallback: per-symbol chart endpoint
      const quotes = await Promise.all(symbols.map(fetchChartQuote));
      return json({ quotes: quotes.filter(Boolean) });
    }
    const data = await r.json();
    const quotes: Quote[] = (data?.quoteResponse?.result ?? []).map((q: any) => ({
      symbol: q.symbol,
      shortName: q.shortName,
      longName: q.longName,
      regularMarketPrice: q.regularMarketPrice,
      regularMarketChange: q.regularMarketChange,
      regularMarketChangePercent: q.regularMarketChangePercent,
      regularMarketDayHigh: q.regularMarketDayHigh,
      regularMarketDayLow: q.regularMarketDayLow,
      regularMarketVolume: q.regularMarketVolume,
      marketCap: q.marketCap,
      currency: q.currency,
    }));
    return json({ quotes });
  } catch (e) {
    console.error("market-quotes error", e);
    return json({ error: String(e) }, 500);
  }
});

async function fetchChartQuote(symbol: string): Promise<Quote | null> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    const change = price - prev;
    return {
      symbol: meta.symbol,
      shortName: meta.symbol,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: prev ? (change / prev) * 100 : 0,
      currency: meta.currency,
    };
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
