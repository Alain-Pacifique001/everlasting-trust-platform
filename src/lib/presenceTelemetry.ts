import { supabase } from '@/integrations/supabase/client';

export type TelemetryEvent =
  | 'connect' | 'disconnect' | 'reconnect' | 'subscribed'
  | 'presence_sync' | 'typing_sent' | 'typing_received' | 'latency_probe';

interface LogArgs {
  organizationId: string;
  userId: string;
  channel: string;
  event: TelemetryEvent;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

const BUFFER: any[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (!BUFFER.length) return;
  const batch = BUFFER.splice(0, BUFFER.length);
  supabase.from('presence_telemetry').insert(batch).then(({ error }) => {
    if (error) console.warn('[telemetry] insert failed', error.message);
  });
}

export function logPresenceEvent(args: LogArgs) {
  const row = {
    organization_id: args.organizationId,
    user_id: args.userId,
    channel: args.channel,
    event_type: args.event,
    latency_ms: args.latencyMs ?? null,
    metadata: args.metadata ?? {},
  };
  // Always console-log for live debugging
  console.info(`[realtime:${args.channel}] ${args.event}`, {
    latencyMs: args.latencyMs, ...args.metadata,
  });
  BUFFER.push(row);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

export function flushTelemetry() {
  if (timer) { clearTimeout(timer); timer = null; }
  flush();
}
