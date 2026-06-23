import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, SkipForward, AudioLines, Plus, Search, Clock,
  CheckCircle2, Loader2, Mic, Square, Users, X, Minus, Maximize2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import AccessDenied from '@/components/AccessDenied';
import { toast } from '@/components/ui/sonner';

type Briefing = {
  id: string;
  title: string;
  script: string;
  audio_url: string | null;
  duration_seconds: number;
  created_at: string;
  created_by: string;
};

type Member = { user_id: string; full_name: string; email: string };

function Waveform({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-10">
      {Array.from({ length: 28 }).map((_, i) => (
        <span key={i} className="w-[3px] rounded-full bg-primary"
          style={{
            height: `${20 + Math.abs(Math.sin(i * 0.6)) * 70}%`,
            animation: playing ? `wfPulse 0.${(i % 5) + 4}s ease-in-out ${i * 30}ms infinite alternate` : 'none',
            opacity: playing ? 1 : 0.35,
          }} />
      ))}
      <style>{`@keyframes wfPulse{from{transform:scaleY(.4)}to{transform:scaleY(1)}}`}</style>
    </div>
  );
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function VoiceBriefings() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { canView, canManage } = useModuleAccess('voice_briefings');
  const PAGE_SIZE = 10;
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [assignedMap, setAssignedMap] = useState<Record<string, string[]>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'played' | 'unplayed' | 'assigned'>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', script: '' });
  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }, []);

  const fetchPage = async (from: number) => {
    if (!organization || !user) return { items: [] as Briefing[], end: true };
    let q = supabase
      .from('voice_briefings')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (search.trim()) q = q.ilike('title', `%${search.trim()}%`);
    const { data } = await q;
    const items = (data ?? []) as Briefing[];
    return { items, end: items.length < PAGE_SIZE };
  };

  const fetchAssignments = async (ids: string[]) => {
    if (!ids.length) return {};
    const { data } = await supabase
      .from('voice_briefing_assignments')
      .select('briefing_id, user_id')
      .in('briefing_id', ids);
    const map: Record<string, string[]> = {};
    (data ?? []).forEach((r: any) => {
      (map[r.briefing_id] ||= []).push(r.user_id);
    });
    return map;
  };

  useEffect(() => {
    if (!user || !organization || !canView) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ items, end }, { data: plays }, { data: mems }] = await Promise.all([
        fetchPage(0),
        supabase.from('voice_briefing_plays').select('briefing_id').eq('user_id', user.id),
        supabase.from('organization_members').select('user_id, profiles(full_name, email)')
          .eq('organization_id', organization.id),
      ]);
      if (cancelled) return;
      const assigns = await fetchAssignments(items.map((b) => b.id));
      setBriefings(items);
      setHasMore(!end);
      setPlayedIds(new Set((plays ?? []).map((p: any) => p.briefing_id)));
      setAssignedMap(assigns);
      setMembers((mems ?? []).map((m: any) => ({
        user_id: m.user_id,
        full_name: m.profiles?.full_name || m.profiles?.email || 'Member',
        email: m.profiles?.email || '',
      })));
      if (items.length) setActiveId(items[0].id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, organization, canView, search]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { items, end } = await fetchPage(briefings.length);
    const assigns = await fetchAssignments(items.map((b) => b.id));
    setBriefings((prev) => [...prev, ...items]);
    setAssignedMap((prev) => ({ ...prev, ...assigns }));
    setHasMore(!end);
    setLoadingMore(false);
  };

  const clearFilters = () => { setSearch(''); setFilter('all'); };

  const filtered = useMemo(() => {
    return briefings.filter((b) => {
      if (filter === 'played' && !playedIds.has(b.id)) return false;
      if (filter === 'unplayed' && playedIds.has(b.id)) return false;
      if (filter === 'assigned' && !(assignedMap[b.id] ?? []).includes(user?.id ?? '')) return false;
      return true;
    });
  }, [briefings, filter, playedIds, assignedMap, user]);

  const current = briefings.find((b) => b.id === activeId) ?? filtered[0] ?? null;

  // Resolve signed URL for current audio
  useEffect(() => {
    (async () => {
      if (!current?.audio_url) return;
      if (signedUrls[current.id]) return;
      const path = current.audio_url;
      const { data } = await supabase.storage.from('voice-briefings').createSignedUrl(path, 3600);
      if (data?.signedUrl) setSignedUrls((p) => ({ ...p, [current.id]: data.signedUrl }));
    })();
  }, [current, signedUrls]);

  const recordPlay = async (briefing: Briefing, completed: boolean) => {
    if (!user) return;
    setPlayedIds((prev) => new Set(prev).add(briefing.id));
    await supabase.from('voice_briefing_plays').insert({
      briefing_id: briefing.id, user_id: user.id, completed,
    });
  };

  const toggle = () => {
    if (!current) return;
    if (playing) {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (current.audio_url && signedUrls[current.id]) {
      const a = new Audio(signedUrls[current.id]);
      audioRef.current = a;
      a.onended = () => { setPlaying(false); recordPlay(current, true); };
      a.onerror = () => setPlaying(false);
      a.play().catch(() => setPlaying(false));
      setPlaying(true);
      recordPlay(current, false);
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(current.script || current.title);
    u.onend = () => { setPlaying(false); recordPlay(current, true); };
    u.onerror = () => setPlaying(false);
    utterRef.current = u;
    window.speechSynthesis.speak(u);
    setPlaying(true);
    recordPlay(current, false);
  };

  const next = () => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    setPlaying(false);
    if (!filtered.length) return;
    const idx = filtered.findIndex((b) => b.id === current?.id);
    setActiveId(filtered[(idx + 1) % filtered.length].id);
  };

  // Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      toast.error(e?.message || 'Microphone permission denied');
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const discardRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
  };

  const resetForm = () => {
    setForm({ title: '', script: '' });
    setRecipients(new Set());
    discardRecording();
  };

  const createBriefing = async () => {
    if (!user || !organization || !form.title.trim()) return;
    setSaving(true);
    let audioPath: string | null = null;
    if (recordedBlob) {
      const path = `${user.id}/${Date.now()}.webm`;
      const { error: upErr } = await supabase.storage
        .from('voice-briefings').upload(path, recordedBlob, { contentType: 'audio/webm' });
      if (upErr) { setSaving(false); toast.error(upErr.message); return; }
      audioPath = path;
    }
    const { data, error } = await supabase.from('voice_briefings').insert({
      organization_id: organization.id,
      created_by: user.id,
      title: form.title.trim(),
      script: form.script.trim(),
      audio_url: audioPath,
      duration_seconds: Math.max(15, Math.round((form.script.split(/\s+/).filter(Boolean).length) / 2.5)),
    }).select().single();
    if (error || !data) { setSaving(false); toast.error(error?.message || 'Failed'); return; }
    if (recipients.size > 0) {
      const rows = Array.from(recipients).map((uid) => ({ briefing_id: data.id, user_id: uid }));
      await supabase.from('voice_briefing_assignments').insert(rows);
      setAssignedMap((prev) => ({ ...prev, [data.id]: Array.from(recipients) }));
    }
    setSaving(false);
    setBriefings((prev) => [data as Briefing, ...prev]);
    setActiveId((data as Briefing).id);
    resetForm();
    setOpen(false);
    toast.success('Briefing created');
  };

  if (!canView) return <AccessDenied message="You don't have access to AI Voice Briefings." />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <AudioLines className="w-4 h-4 text-primary" /> AI Voice Briefings
          </CardTitle>
          {canManage && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="w-3.5 h-3.5" /> New
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>New voice briefing</DialogTitle></DialogHeader>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <Textarea rows={5} placeholder="Briefing script (optional if recording audio)…" value={form.script}
                    onChange={(e) => setForm({ ...form, script: e.target.value })} />

                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Mic className="w-4 h-4" /> Record your voice
                      </span>
                      {!recording && !recordedBlob && (
                        <Button size="sm" variant="outline" onClick={startRecording}>Start</Button>
                      )}
                      {recording && (
                        <Button size="sm" variant="destructive" onClick={stopRecording} className="gap-1">
                          <Square className="w-3 h-3" /> Stop
                        </Button>
                      )}
                      {recordedBlob && !recording && (
                        <Button size="sm" variant="ghost" onClick={discardRecording} className="gap-1">
                          <X className="w-3 h-3" /> Discard
                        </Button>
                      )}
                    </div>
                    {recording && <p className="text-xs text-destructive">● Recording…</p>}
                    {recordedUrl && <audio src={recordedUrl} controls className="w-full" />}
                  </div>

                  <div className="rounded-md border p-3 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <Users className="w-4 h-4" /> Recipients
                      <span className="text-xs text-muted-foreground font-normal">
                        ({recipients.size === 0 ? 'all organization members' : `${recipients.size} selected`})
                      </span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {members.filter((m) => m.user_id !== user?.id).map((m) => (
                        <label key={m.user_id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent/40 cursor-pointer">
                          <Checkbox
                            checked={recipients.has(m.user_id)}
                            onCheckedChange={(v) => {
                              setRecipients((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(m.user_id); else next.delete(m.user_id);
                                return next;
                              });
                            }}
                          />
                          <span className="flex-1 truncate">{m.full_name}</span>
                          <span className="text-xs text-muted-foreground truncate">{m.email}</span>
                        </label>
                      ))}
                      {members.length <= 1 && (
                        <p className="text-xs text-muted-foreground">No teammates yet.</p>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
                  <Button onClick={createBriefing} disabled={saving || !form.title.trim()}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : current ? (
          <div className="rounded-xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
            <div className="flex items-center gap-4">
              <div className="size-14 sm:size-16 rounded-full bg-primary grid place-items-center shadow-lg shrink-0">
                <AudioLines className={cn('w-6 h-6 sm:w-7 sm:h-7 text-primary-foreground', playing && 'animate-pulse')} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate flex items-center gap-2">
                  {current.title}
                  {current.audio_url && <Badge variant="outline" className="text-[10px]">Recorded</Badge>}
                </div>
                <div className="mt-2"><Waveform playing={playing} /></div>
              </div>
            </div>
            {current.script && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">{current.script}</p>
            )}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Button onClick={toggle} size="sm" className="gap-2">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {playing ? 'Pause' : 'Play briefing'}
              </Button>
              <Button onClick={next} size="sm" variant="outline" className="gap-2" disabled={filtered.length < 2}>
                <SkipForward className="w-4 h-4" /> Next
              </Button>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {fmtDate(current.created_at)}
              </span>
              {(assignedMap[current.id]?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Users className="w-3 h-3" /> {assignedMap[current.id].length} recipients
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            No briefings yet.{canManage && ' Click "New" to create one.'}
          </p>
        )}

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Search briefings by title…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'unplayed', 'played', 'assigned'] as const).map((f) => {
              const inboxCount = f === 'assigned'
                ? briefings.filter((b) => (assignedMap[b.id] ?? []).includes(user?.id ?? '') && !playedIds.has(b.id)).length
                : 0;
              return (
                <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs capitalize gap-1" onClick={() => setFilter(f)}>
                  {f === 'assigned' ? 'Inbox' : f}
                  {f === 'assigned' && inboxCount > 0 && (
                    <Badge variant="destructive" className="h-4 px-1 text-[10px]">{inboxCount}</Badge>
                  )}
                </Button>
              );
            })}
            {(search || filter !== 'all') && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={clearFilters}>
                Clear
              </Button>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} shown</span>
          </div>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filtered.map((b) => {
            const played = playedIds.has(b.id);
            const assignees = assignedMap[b.id] ?? [];
            return (
              <button key={b.id}
                onClick={() => {
                  window.speechSynthesis?.cancel();
                  audioRef.current?.pause();
                  setPlaying(false);
                  setActiveId(b.id);
                }}
                className={cn(
                  'w-full text-left rounded-lg border p-3 transition-all hover:bg-accent/40',
                  b.id === current?.id && 'border-primary ring-1 ring-primary/40'
                )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight truncate flex items-center gap-2">
                      {b.title}
                      {b.audio_url && <Badge variant="outline" className="text-[10px]">Voice</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {fmtDate(b.created_at)}
                      {assignees.length > 0 && (
                        <>
                          <span className="mx-1">•</span>
                          <Users className="w-3 h-3" /> {assignees.length}
                        </>
                      )}
                    </div>
                  </div>
                  {played && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <CheckCircle2 className="w-3 h-3" /> Played
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
          {!loading && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No matches.</p>
          )}
          {hasMore && !search && filter === 'all' && (
            <Button variant="outline" size="sm" className="w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load more'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
