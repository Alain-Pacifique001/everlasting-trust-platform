// Returns exchange rates from a base currency. Uses the free, key-less open.er-api.com.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tiny in-memory cache (per cold start) to reduce upstream calls.
const cache = new Map<string, { ts: number; rates: Record<string, number> }>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const base = (url.searchParams.get("base") ?? "USD").toUpperCase();

    const cached = cache.get(base);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      return json({ base, rates: cached.rates, cached: true });
    }

    const r = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
    if (!r.ok) {
      // Fallback minimal rates so the app keeps working
      const fallback: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, RWF: 1380, CNY: 7.2, KES: 129, NGN: 1500, ZAR: 18 };
      return json({ base: "USD", rates: fallback, fallback: true });
    }
    const data = await r.json();
    const rates = data.rates as Record<string, number>;
    cache.set(base, { ts: Date.now(), rates });
    return json({ base, rates });
  } catch (e) {
    console.error("exchange-rates error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
