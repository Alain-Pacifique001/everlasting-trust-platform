import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { TotpChallenge } from '@/components/settings/TotpChallenge';

interface Factor {
  id: string;
  status: string;
  friendly_name?: string;
}

interface Props {
  onStatusChange?: (enabled: boolean) => void;
}

export const TwoFactorAuth = ({ onStatusChange }: Props = {}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [disableChallengeOpen, setDisableChallengeOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const verified = data.totp.find((f) => f.status === 'verified');
    const next = verified ? { id: verified.id, status: verified.status, friendly_name: verified.friendly_name } : null;
    setFactor(next);
    onStatusChange?.(!!next);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEnrollment = async () => {
    setBusy(true);
    // Clean up any unverified factors first to avoid "factor exists" errors
    const { data: list } = await supabase.auth.mfa.listFactors();
    if (list) {
      for (const f of list.totp) {
        if (f.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const cancelEnrollment = async () => {
    if (!enrollment) return;
    setBusy(true);
    await supabase.auth.mfa.unenroll({ factorId: enrollment.id });
    setEnrollment(null);
    setCode('');
    setBusy(false);
  };

  const verifyEnrollment = async () => {
    if (!enrollment || code.length < 6) {
      toast.error(t('settings.twoFactor.invalidCode'));
      return;
    }
    setBusy(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (cErr || !challenge) {
      setBusy(false);
      toast.error(cErr?.message || 'Challenge failed');
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: enrollment.id,
      challengeId: challenge.id,
      code,
    });
    setBusy(false);
    if (vErr) {
      toast.error(vErr.message);
      return;
    }
    toast.success(t('settings.twoFactor.enabled'));
    setEnrollment(null);
    setCode('');
    await refresh();
  };

  const performDisable = async () => {
    if (!factor) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    // Clean up any remaining recovery codes
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('mfa_recovery_codes').delete().eq('user_id', user.id);
    }
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t('settings.twoFactor.disabled'));
    await refresh();
  };

  const disable2FA = () => {
    if (!factor) return;
    setDisableChallengeOpen(true);
  };

  const copySecret = async () => {
    if (!enrollment) return;
    await navigator.clipboard.writeText(enrollment.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {factor ? (
            <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5" />
          ) : (
            <ShieldOff className="w-5 h-5 text-muted-foreground mt-0.5" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">{t('settings.twoFactor.title')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.twoFactor.desc')}</p>
          </div>
        </div>
        {factor ? (
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            {t('settings.twoFactor.enabledBadge')}
          </Badge>
        ) : (
          <Badge variant="outline">{t('settings.twoFactor.disabledBadge')}</Badge>
        )}
      </div>

      {factor && !enrollment && (
        <Button variant="destructive" size="sm" onClick={disable2FA} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {t('settings.twoFactor.disable')}
        </Button>
      )}

      {!factor && !enrollment && (
        <Button size="sm" onClick={startEnrollment} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {t('settings.twoFactor.enable')}
        </Button>
      )}

      {enrollment && (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>{t('settings.twoFactor.scanTitle')}</AlertTitle>
            <AlertDescription>{t('settings.twoFactor.scanDesc')}</AlertDescription>
          </Alert>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div
              className="rounded-lg bg-white p-2 border border-border"
              dangerouslySetInnerHTML={{ __html: enrollment.qr }}
            />
            <div className="flex-1 w-full space-y-2">
              <Label className="text-xs text-muted-foreground">{t('settings.twoFactor.manualKey')}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-muted px-3 py-2 rounded break-all">
                  {enrollment.secret}
                </code>
                <Button size="icon" variant="outline" onClick={copySecret} title={t('settings.twoFactor.copy')}>
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="totpCode">{t('settings.twoFactor.codeLabel')}</Label>
            <Input
              id="totpCode"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={verifyEnrollment} disabled={busy || code.length < 6}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t('settings.twoFactor.verify')}
            </Button>
            <Button variant="ghost" onClick={cancelEnrollment} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      <TotpChallenge
        open={disableChallengeOpen}
        onOpenChange={setDisableChallengeOpen}
        onVerified={performDisable}
        title="Confirm disabling 2FA"
        description="For your security, enter your authenticator code or a recovery code to disable two-factor authentication."
      />
    </div>
  );
};
