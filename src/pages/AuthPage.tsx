import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { Loader2, Eye, EyeOff, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

type SignupRoleOption = {
  id: string;
  organization_id: string;
  role: string;
  label: string | null;
  description: string | null;
  requires_approval: boolean;
  department_id: string | null;
  max_users: number | null;
  current_user_count: number;
};


const hashCode = async (code: string): Promise<string> => {
  const data = new TextEncoder().encode(code);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

type Mode = 'login' | 'signup' | 'forgot' | 'mfa';

const AuthPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [signupRoles, setSignupRoles] = useState<SignupRoleOption[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [signupKind, setSignupKind] = useState<'join' | 'create'>('join');
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgType, setNewOrgType] = useState('business');

  useEffect(() => {
    if (mode !== 'signup') return;
    (supabase as any)
      .from('signup_role_configs')
      .select('id,organization_id,role,label,description,requires_approval,department_id,max_users,current_user_count')
      .eq('is_active', true)
      .then(({ data }: { data: SignupRoleOption[] | null }) => {
        const filtered = (data ?? []).filter((r) => r.max_users == null || r.current_user_count < r.max_users);
        setSignupRoles(filtered);
      });
  }, [mode]);


  // MFA state — surfaced after a successful password sign-in if a TOTP factor is required
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const completeSignIn = () => {
    toast.success('Signed in');
    navigate('/dashboard');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // After signing in, check whether 2FA is required to reach AAL2
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.find((f) => f.status === 'verified');
        if (totp) {
          setMfaFactorId(totp.id);
          setMode('mfa');
          setLoading(false);
          return;
        }
      }
      setLoading(false);
      completeSignIn();
    } catch (err: any) {
      setLoading(false);
      toast.error(err.message);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (signupKind === 'create') {
        if (!newOrgName.trim() || newOrgName.trim().length < 2) {
          throw new Error('Organization name must be at least 2 characters');
        }
      }
      const role = signupKind === 'join' ? signupRoles.find((r) => r.id === selectedRoleId) : undefined;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
      });
      if (error) throw error;

      if (data.session && data.user) {
        if (signupKind === 'create') {
          // Create org → trigger auto-grants Owner role and seeds system roles.
          const { data: org, error: orgErr } = await supabase.from('organizations').insert({
            name: newOrgName.trim(),
            type: newOrgType,
            created_by: data.user.id,
          }).select('id').single();
          if (orgErr) throw orgErr;
          toast.success(`Organization "${newOrgName.trim()}" created — you're the Owner.`);
          navigate('/dashboard');
          return;
        }
        if (role) {
          const { error: rrErr } = await (supabase as any).from('role_requests').insert({
            user_id: data.user.id,
            organization_id: role.organization_id,
            requested_role: role.role,
            department_id: role.department_id,
            signup_config_id: role.id,
            status: role.requires_approval ? 'pending' : 'approved',
            reason: 'Selected at signup',
          });
          if (rrErr) console.warn('role_request insert failed', rrErr);
          toast.success(role.requires_approval
            ? 'Signed up. Your role request is pending approval.'
            : 'Signed up. Role granted.');
          navigate('/dashboard');
          return;
        }
        navigate('/dashboard');
        return;
      }
      toast.success(t('auth.checkEmail'));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };



  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error('Enter your email'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Reset link sent. Check your inbox (and spam folder) for instructions.', { duration: 6000 });
    setMode('login');
  };

  const [useRecovery, setUseRecovery] = useState(false);

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId) return;
    setLoading(true);
    try {
      if (useRecovery) {
        const normalized = mfaCode.trim().toUpperCase().replace(/\s/g, '');
        if (!normalized) throw new Error('Enter a recovery code');
        const hash = await hashCode(normalized);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        const { data: row } = await supabase
          .from('mfa_recovery_codes')
          .select('id')
          .eq('user_id', user.id)
          .eq('code_hash', hash)
          .is('used_at', null)
          .maybeSingle();
        if (!row) throw new Error('Invalid or already used recovery code');
        await supabase.from('mfa_recovery_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
        // Recovery bypass: remove the factor so session is no longer AAL2-gated.
        await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
        toast.success('Recovery code accepted. Please re-enroll 2FA from Settings.');
        setLoading(false);
        completeSignIn();
        return;
      }
      const digits = mfaCode.replace(/\D/g, '');
      if (digits.length !== 6) throw new Error('Enter the 6-digit code');
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (cErr || !challenge) throw cErr || new Error('Challenge failed');
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: digits });
      if (vErr) throw vErr;
      setLoading(false);
      completeSignIn();
    } catch (err: any) {
      setLoading(false);
      toast.error(err.message);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setLoading(false);
        toast.error(result.error.message ?? 'Google sign-in failed');
        return;
      }
      if (result.redirected) return;
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.find((f) => f.status === 'verified');
        if (totp) {
          setMfaFactorId(totp.id);
          setMode('mfa');
          setLoading(false);
          return;
        }
      }
      setLoading(false);
      completeSignIn();
    } catch (err: any) {
      setLoading(false);
      toast.error(err.message ?? 'Google sign-in failed');
    }
  };

  const cancelMfa = async () => {
    await supabase.auth.signOut();
    setMfaFactorId(null);
    setMfaCode('');
    setUseRecovery(false);
    setMode('login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center relative">
          <Link
            to="/dashboard"
            className="absolute left-4 top-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </Link>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
            {t('auth.title')}
          </CardTitle>
          <CardDescription>
            {mode === 'login' && t('auth.signInToAccount')}
            {mode === 'signup' && t('auth.createNewAccount')}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'mfa' && 'Two-factor verification'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'mfa' ? (
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-2">
                {useRecovery ? <KeyRound className="w-4 h-4 text-primary mt-0.5" /> : <ShieldCheck className="w-4 h-4 text-primary mt-0.5" />}
                <p className="text-xs text-muted-foreground">
                  {useRecovery
                    ? 'Enter one of your saved recovery codes. It will be consumed and your authenticator will be reset — re-enroll 2FA after signing in.'
                    : 'Open your authenticator app and enter the 6-digit code to finish signing in.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mfaCode">{useRecovery ? 'Recovery code' : 'Verification code'}</Label>
                <Input
                  id="mfaCode"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(useRecovery ? e.target.value.toUpperCase().slice(0, 16) : e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={useRecovery ? 'AB2CD-EFG3H' : '123456'}
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  className={useRecovery ? 'font-mono' : ''}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & sign in
              </Button>
              <button
                type="button"
                onClick={() => { setUseRecovery((v) => !v); setMfaCode(''); }}
                className="text-xs text-primary hover:underline w-full text-center"
              >
                {useRecovery ? 'Use authenticator code instead' : 'Use a recovery code instead'}
              </button>
              <Button type="button" variant="ghost" className="w-full" onClick={cancelMfa}>
                Cancel
              </Button>
            </form>
          ) : mode === 'forgot' ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('login')}>
                Back to sign in
              </Button>
            </form>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full mb-4"
                onClick={handleGoogle}
                disabled={loading}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.13 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                </svg>
                Continue with Google
              </Button>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
            <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
              {mode === 'signup' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">{t('auth.fullName')}</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('auth.namePlaceholder')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant={signupKind === 'join' ? 'default' : 'outline'} size="sm"
                        onClick={() => setSignupKind('join')}>Join existing</Button>
                      <Button type="button" variant={signupKind === 'create' ? 'default' : 'outline'} size="sm"
                        onClick={() => setSignupKind('create')}>Create new</Button>
                    </div>
                  </div>
                  {signupKind === 'create' ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="newOrgName">Organization name</Label>
                        <Input id="newOrgName" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)}
                          placeholder="Acme Inc." required minLength={2} maxLength={120} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newOrgType">Type</Label>
                        <Select value={newOrgType} onValueChange={setNewOrgType}>
                          <SelectTrigger id="newOrgType"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="business">Business</SelectItem>
                            <SelectItem value="personal">Personal</SelectItem>
                            <SelectItem value="nonprofit">Non-profit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">You'll be set as <strong>Owner</strong> of the new organization automatically.</p>
                    </>
                  ) : signupRoles.length > 0 ? (
                    <div className="space-y-2">
                      <Label htmlFor="signupRole">Requested role</Label>
                      <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                        <SelectTrigger id="signupRole">
                          <SelectValue placeholder="Select a role to request" />
                        </SelectTrigger>
                        <SelectContent>
                          {signupRoles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.label ?? r.role}
                              {r.requires_approval ? ' (approval required)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedRoleId && signupRoles.find(r => r.id === selectedRoleId)?.description && (
                        <p className="text-xs text-muted-foreground">{signupRoles.find(r => r.id === selectedRoleId)?.description}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">After signing up you'll be prompted to enter a join code from your admin.</p>
                  )}
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'login' ? t('auth.signIn') : t('auth.signUp')}
              </Button>
            </form>
            </>
          )}

          {(mode === 'login' || mode === 'signup') && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-primary underline hover:no-underline"
              >
                {mode === 'login' ? t('auth.signUp') : t('auth.signIn')}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;
