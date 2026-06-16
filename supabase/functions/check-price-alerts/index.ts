// Checks active price alerts against current market prices and creates notifications when triggered.
// Triggered by a pg_cron job every 5 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: alerts, error } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("active", true);

    if (error) throw error;
    if (!alerts || alerts.length === 0) {
      return json({ checked: 0, triggered: 0 });
    }

    const symbols = [...new Set(alerts.map((a) => a.symbol))];
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    const data = await r.json();
    const prices: Record<string, number> = {};
    for (const q of data?.quoteResponse?.result ?? []) {
      if (q.symbol && q.regularMarketPrice != null) {
        prices[q.symbol] = q.regularMarketPrice;
      }
    }

    let triggered = 0;
    for (const alert of alerts) {
      const price = prices[alert.symbol];
      if (price == null) continue;

      const target = Number(alert.target_price);
      const hit =
        (alert.condition === "above" && price >= target) ||
        (alert.condition === "below" && price <= target);

      if (!hit) continue;

      // Cooldown: don't re-trigger within 1 hour
      if (alert.last_triggered_at) {
        const lastMs = new Date(alert.last_triggered_at).getTime();
        if (Date.now() - lastMs < 60 * 60 * 1000) continue;
      }

      const condText = alert.condition === "above" ? "rose above" : "fell below";
      await supabase.from("notifications").insert({
        user_id: alert.user_id,
        title: `${alert.symbol} ${condText} $${target}`,
        message: `Current price: $${price.toFixed(2)}. Your alert for ${alert.name || alert.symbol} has been triggered.`,
        type: "price_alert",
        link: "/market",
      });

      await supabase
        .from("price_alerts")
        .update({ last_triggered_at: new Date().toISOString() })
        .eq("id", alert.id);

      triggered++;
    }

    return json({ checked: alerts.length, triggered });
  } catch (e) {
    console.error("check-price-alerts error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
