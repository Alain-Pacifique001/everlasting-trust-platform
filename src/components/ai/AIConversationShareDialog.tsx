import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';

type Participant = {
  id: string;
  user_id: string;
  permission: 'owner' | 'editor' | 'viewer';
  created_at: string;
  profile?: { full_name: string | null; email: string | null } | null;
};

const emailSchema = z.string().trim().email().max(255);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  ownerId: string;
  currentUserId: string;
}

export default function AIConversationShareDialog({ open, onOpenChange, conversationId, ownerId, currentUserId }: Props) {
  const { t } = useTranslation();
  const isOwner = currentUserId === ownerId;
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'editor' | 'viewer'>('viewer');
  const [adding, setAdding] = useState(false);

  const fetchParticipants = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('ai_conversation_participants')
      .select('id,user_id,permission,created_at')
      .eq('conversation_id', conversationId);
    const rows = (data ?? []) as Participant[];
    if (rows.length) {
      const ids = rows.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', ids);
      const pmap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      rows.forEach(r => { r.profile = pmap.get(r.user_id) ?? null; });
    }
    setParticipants(rows);
    setLoading(false);
  };

  useEffect(() => { if (open) fetchParticipants(); }, [open, conversationId]);

  const addParticipant = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { toast.error(t('ai_share.toast.invalidEmail')); return; }
    if (!isOwner) { toast.error(t('ai_share.toast.onlyOwner')); return; }
    setAdding(true);
    try {
      const { data: lookup, error: lookupErr } = await supabase.rpc('find_user_by_email', { _email: parsed.data });
      if (lookupErr) throw lookupErr;
      const target = (lookup as any)?.[0];
      if (!target) { toast.error(t('ai_share.toast.notFound')); return; }
      if (target.user_id === ownerId) { toast.error(t('ai_share.toast.alreadyOwner')); return; }
      const { error } = await (supabase as any).from('ai_conversation_participants').insert({
        conversation_id: conversationId,
        user_id: target.user_id,
        permission,
        added_by: currentUserId,
      });
      if (error) {
        if (error.code === '23505') toast.error(t('ai_share.toast.alreadyShared'));
        else throw error;
      } else {
        await (supabase as any).from('ai_conversation_audit_logs').insert({
          conversation_id: conversationId, actor_id: currentUserId,
          action: 'share.granted', metadata: { target_user: target.user_id, permission },
        });
        toast.success(t('ai_share.toast.shared', { email: target.email }));
        setEmail('');
        fetchParticipants();
      }
    } catch (e: any) {
      toast.error(e.message ?? t('ai_share.toast.failed'));
    } finally {
      setAdding(false);
    }
  };

  const revoke = async (p: Participant) => {
    if (!isOwner) return;
    const { error } = await (supabase as any).from('ai_conversation_participants').delete().eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    await (supabase as any).from('ai_conversation_audit_logs').insert({
      conversation_id: conversationId, actor_id: currentUserId,
      action: 'share.revoked', metadata: { target_user: p.user_id },
    });
    toast.success(t('ai_share.toast.revoked'));
    fetchParticipants();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="ai-share-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4" /> {t('ai_share.title')}</DialogTitle>
          <DialogDescription>
            {isOwner ? t('ai_share.descOwner') : t('ai_share.descViewer')}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="space-y-2">
            <Label htmlFor="share-email">{t('ai_share.email')}</Label>
            <div className="flex gap-2">
              <Input id="share-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('ai_share.emailPlaceholder')} data-testid="ai-share-email" />
              <Select value={permission} onValueChange={(v) => setPermission(v as 'editor' | 'viewer')}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">{t('ai_share.permissions.viewer')}</SelectItem>
                  <SelectItem value="editor">{t('ai_share.permissions.editor')}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addParticipant} disabled={adding || !email} data-testid="ai-share-submit">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : t('ai_share.share')}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">{t('ai_share.peopleWithAccess')}</Label>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : participants.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="ai-share-empty">{t('ai_share.empty')}</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto" data-testid="ai-share-participants">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2" data-testid={`ai-share-participant-${p.user_id}`}>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{p.profile?.full_name || p.profile?.email || p.user_id.slice(0, 8)}</p>
                    {p.profile?.email && <p className="text-xs text-muted-foreground truncate">{p.profile.email}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">{t(`ai_share.permissions.${p.permission}` as any, { defaultValue: p.permission })}</Badge>
                    {isOwner && (
                      <Button size="sm" variant="ghost" onClick={() => revoke(p)} aria-label={t('ai_share.revoke')} data-testid="ai-share-revoke">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
