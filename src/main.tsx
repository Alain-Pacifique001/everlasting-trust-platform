import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";

// One-shot, idempotent bootstrap of the default administrative account.
// Runs at most once per browser via a localStorage flag; the edge function
// itself is also idempotent server-side.
(function bootstrapAdminOnce() {
  try {
    const KEY = "savvy.bootstrap_admin.v1";
    if (typeof window === "undefined" || localStorage.getItem(KEY)) return;
    supabase.functions
      .invoke("bootstrap-admin", { body: {} })
      .then(({ error }) => {
        if (!error) localStorage.setItem(KEY, new Date().toISOString());
      })
      .catch(() => { /* best-effort, silent */ });
  } catch { /* noop */ }
})();

createRoot(document.getElementById("root")!).render(<App />);
