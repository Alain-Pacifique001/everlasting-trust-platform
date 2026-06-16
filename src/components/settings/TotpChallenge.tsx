import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once a TOTP (or recovery code) check succeeds. */
  onVerified: () => void;
  title?: string;
  description?: string;
}

const hashCode = async (code: string): Promise<string> => {
  const data = new TextEncoder().encode(code);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Reusable dialog that asks the current user for a TOTP code (or recovery code) before sensitive actions. */
export const TotpChallenge = ({ open, onOpenChange, onVerified, title = 'Confirm with 2FA', description = 'Enter your 6-digit code from your authenticator app, or use a recovery code.' }: Props) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const handleVerify = async () => {
    const value = code.trim();
    if (!value) { toast.error('Enter a code'); return; }
    setBusy(true);

    // Recovery codes contain a dash; TOTP codes are 6 digits
    const isRecovery = value.includes('-') || value.length > 8;

    try {
      if (isRecovery) {
        const normalized = value.toUpperCase().replace(/\s/g, '');
        const hash = await hashCode(normalized);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        // Atomically consume: only succeeds if used_at is still null
        const { data: consumed, error: consumeErr } = await supabase
          .from('mfa_recovery_codes')
          .update({ used_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('code_hash', hash)
          .is('used_at', null)
          .select('id')
          .maybeSingle();
        if (consumeErr) throw consumeErr;
        if (!consumed) {
          toast.error('Invalid or already used recovery code');
          setBusy(false);
          return;
        }
        toast.success('Recovery code accepted');
      } else {
        const digits = value.replace(/\D/g, '');
        if (digits.length !== 6) { toast.error('Enter a 6-digit code'); setBusy(false); return; }
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = factors?.totp.find((f) => f.status === 'verified');
        if (!verified) { toast.error('No active 2FA factor found'); setBusy(false); return; }
        const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: verified.id });
        if (cErr || !challenge) throw cErr || new Error('Challenge failed');
        const { error: vErr } = await supabase.auth.mfa.verify({ factorId: verified.id, challengeId: challenge.id, code: digits });
        if (vErr) throw vErr;
      }

      setBusy(false);
      setCode('');
      onOpenChange(false);
      onVerified();
    } catch (err: any) {
      setBusy(false);
      toast.error(err.message ?? 'Verification failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" />{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="totp-challenge">Code</Label>
          <Input
            id="totp-challenge"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456 or AB2CD-EFG3H"
            autoComplete="one-time-code"
            inputMode="text"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleVerify} disabled={busy || !code.trim()}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
