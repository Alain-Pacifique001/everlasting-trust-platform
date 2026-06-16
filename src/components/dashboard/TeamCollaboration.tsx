import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, AtSign, Users, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import AccessDenied from '@/components/AccessDenied';
import { toast } from '@/components/ui/sonner';
import { logPresenceEvent } from '@/lib/presenceTelemetry';

type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  client_nonce?: string | null;
};

type Member = { user_id: string; full_name: string; email: string };

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export default function TeamCollaboration() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { canView, canManage } = useModuleAccess('collaboration');
  const [thread, setThread] = useState<{ id: string; title: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [presence, setPresence] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // bootstrap: ensure default thread + load members
  useEffect(() => {
    if (!user || !organization || !canView) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: existing } = await supabase
        .from('collab_threads')
        .select('id, title')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      let t = existing;
      if (!t && canManage) {
        const { data: created, error } = await supabase
          .from('collab_threads')
          .insert({ organization_id: organization.id, created_by: user.id, title: 'General' })
          .select('id, title')
          .single();
        if (error) toast.error(error.message); else t = created;
      }
      if (cancelled) return;
      setThread(t ?? null);

      // members
      const { data: m } = await supabase
        .from('organization_members')
        .select('user_id, profiles(full_name, email)')
        .eq('organization_id', organization.id);
      const list: Member[] = (m ?? []).map((row: any) => ({
        user_id: row.user_id,
        full_name: row.profiles?.full_name || row.profiles?.email || 'Member',
        email: row.profiles?.email || '',
      }));
      setMembers(list);

      if (t) {
        const { data: msgs } = await supabase
          .from('collab_messages')
          .select('*')
          .eq('thread_id', t.id)
          .order('created_at', { ascending: true })
          .limit(200);
        setMessages((msgs ?? []) as Message[]);

        // mark read
        await supabase.from('collab_read_receipts').upsert({
          thread_id: t.id, user_id: user.id, last_read_at: new Date().toISOString(),
        }, { onConflict: 'thread_id,user_id' });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, organization, canView, canManage]);

  // realtime + presence + typing
  useEffect(() => {
    if (!user || !organization || !thread) return;
    const channelName = `collab:${thread.id}`;
    const connectStart = performance.now();
    const ch = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    ch.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'collab_messages', filter: `thread_id=eq.${thread.id}` },
      (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
      });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      setPresence(new Set(Object.keys(state)));
      logPresenceEvent({
        organizationId: organization.id, userId: user.id, channel: channelName,
        event: 'presence_sync', metadata: { online: Object.keys(state).length },
      });
    });

    ch.on('presence', { event: 'join' }, ({ key }) => {
      logPresenceEvent({ organizationId: organization.id, userId: user.id, channel: channelName, event: 'connect', metadata: { joined: key } });
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => {
      logPresenceEvent({ organizationId: organization.id, userId: user.id, channel: channelName, event: 'disconnect', metadata: { left: key } });
    });

    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload.user_id === user.id) return;
      setTypingUsers((prev) => ({ ...prev, [payload.user_id]: Date.now() }));
      if (payload.sent_at) {
        logPresenceEvent({
          organizationId: organization.id, userId: user.id, channel: channelName,
          event: 'typing_received', latencyMs: Date.now() - payload.sent_at,
          metadata: { from: payload.user_id },
        });
      }
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ online_at: new Date().toISOString() });
        logPresenceEvent({
          organizationId: organization.id, userId: user.id, channel: channelName,
          event: 'subscribed', latencyMs: Math.round(performance.now() - connectStart),
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        logPresenceEvent({
          organizationId: organization.id, userId: user.id, channel: channelName,
          event: 'reconnect', metadata: { status },
        });
      }
    });

    channelRef.current = ch;
    return () => {
      logPresenceEvent({
        organizationId: organization.id, userId: user.id, channel: channelName,
        event: 'disconnect', metadata: { reason: 'cleanup' },
      });
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [user, organization, thread]);

  // prune stale typing indicators
  useEffect(() => {
    const i = setInterval(() => {
      setTypingUsers((prev) => {
        const next: Record<string, number> = {};
        const now = Date.now();
        Object.entries(prev).forEach(([k, v]) => { if (now - v < 3000) next[k] = v; });
        return next;
      });
    }, 1000);
    return () => clearInterval(i);
  }, []);

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typingUsers]);

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  const onlineCount = presence.size;

  const handleType = () => {
    const ch = channelRef.current;
    if (!ch || !user) return;
    ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id, sent_at: Date.now() } });
  };

  const send = async () => {
    if (!input.trim() || !thread || !user || sending) return;
    const body = input.trim();
    const nonce = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setInput('');
    setSending(true);
    // optimistic
    const optimistic: Message = {
      id: `tmp-${nonce}`, thread_id: thread.id, sender_id: user.id, body,
      created_at: new Date().toISOString(), client_nonce: nonce,
    };
    setMessages((prev) => [...prev, optimistic]);

    const mentions = Array.from(body.matchAll(/@(\w+)/g))
      .map((m) => members.find((u) => u.full_name.toLowerCase().includes(m[1].toLowerCase()))?.user_id)
      .filter(Boolean) as string[];

    const { data, error } = await supabase
      .from('collab_messages')
      .insert({
        thread_id: thread.id,
        organization_id: organization!.id,
        sender_id: user.id,
        body,
        mentions,
        client_nonce: nonce,
      })
      .select()
      .single();
    setSending(false);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error(error.message);
      return;
    }
    setMessages((prev) => prev.map((m) => m.id === optimistic.id ? (data as Message) : m)
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i));
  };

  if (!canView) {
    return <AccessDenied message="You don't have access to Team Collaboration." />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Team Collaboration
          </CardTitle>
          <span className="text-xs text-muted-foreground">{onlineCount} online</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ul className="space-y-1.5 md:col-span-1 order-2 md:order-1 max-h-48 md:max-h-none overflow-y-auto">
            {members.length === 0 && (
              <li className="text-xs text-muted-foreground p-2">No teammates yet.</li>
            )}
            {members.map((p) => (
              <li key={p.user_id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 transition">
                <div className="relative">
                  <div className="size-8 rounded-full bg-primary/15 text-primary grid place-items-center text-[11px] font-semibold">
                    {initials(p.full_name)}
                  </div>
                  <span className={cn(
                    'absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-card',
                    presence.has(p.user_id) ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight truncate">{p.full_name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{p.email}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="md:col-span-2 order-1 md:order-2 flex flex-col rounded-lg border bg-background/50 min-h-[320px]">
            <div className="px-3 py-2 border-b">
              <div className="text-sm font-medium truncate">{thread?.title ?? 'No thread'}</div>
              <div className="text-[11px] text-muted-foreground">{organization?.name}</div>
            </div>
            <div ref={scrollRef} className="flex-1 p-3 space-y-3 max-h-[260px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No messages yet. Start the conversation.</p>
              ) : messages.map((m) => {
                const sender = memberMap.get(m.sender_id);
                const name = sender?.full_name || (m.sender_id === user?.id ? 'You' : 'Member');
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className="flex gap-3">
                    <div className={cn(
                      'size-7 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold',
                      mine ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
                    )}>{initials(name)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium truncate">{name}</span>
                        <span className="text-[11px] text-muted-foreground">{fmtTime(m.created_at)}</span>
                      </div>
                      <div className="text-sm mt-0.5 text-foreground/90 break-words">{m.body}</div>
                    </div>
                  </div>
                );
              })}
              {Object.keys(typingUsers).length > 0 && (
                <div className="flex gap-2 items-center text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-1.5 rounded-full bg-foreground/40 animate-bounce"
                        style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </div>
                  Someone is typing…
                </div>
              )}
            </div>
            <div className="p-2 border-t flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" type="button"
                onClick={() => setInput((v) => v + '@')}>
                <AtSign className="w-4 h-4" />
              </Button>
              <Input
                value={input}
                disabled={!thread || sending}
                onChange={(e) => { setInput(e.target.value); handleType(); }}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                placeholder={thread ? 'Write a comment, @mention a teammate…' : 'Ask an admin to start a thread'}
                className="h-9"
              />
              <Button size="icon" onClick={send} disabled={!thread || sending || !input.trim()} className="h-9 w-9 shrink-0">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
