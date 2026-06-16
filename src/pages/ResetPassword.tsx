import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { Loader2, Lock, Eye, EyeOff, ShieldCheck, Check, X, Sparkles } from 'lucide-react';

const passwordChecks = (pw: string) => ({
  length: pw.length >= 8,
  upper: /[A-Z]/.test(pw),
  number: /[0-9]/.test(pw),
  special: /[^A-Za-z0-9]/.test(pw),
});

const strengthScore = (pw: string) => {
  const c = passwordChecks(pw);
  return Object.values(c).filter(Boolean).length;
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Supabase places a recovery token in the URL hash when the user clicks
    // the email link. The SDK exchanges it automatically and emits a
    // PASSWORD_RECOVERY event. We also accept any active session (in case
    // the user lands here from an already-exchanged link).
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token')) setReady(true);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const score = strengthScore(password);
  const matches = password.length > 0 && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checks.length) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setSuccess(true);
    toast.success('Password updated. Redirecting…');
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate('/auth');
    }, 1500);
  };

  const strengthLabel = ['Too short', 'Weak', 'Okay', 'Strong', 'Excellent'][score];
  const strengthColor = [
    'bg-destructive', 'bg-destructive', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600',
  ][score];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/30 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight text-foreground">Savvy</span>
          </div>
        </div>

        <Card className="border-border/60 shadow-xl shadow-primary/5">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 ring-8 ring-primary/5 flex items-center justify-center">
              {success ? (
                <ShieldCheck className="w-7 h-7 text-primary" />
              ) : (
                <Lock className="w-6 h-6 text-primary" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {success ? 'Password updated' : 'Set a new password'}
            </CardTitle>
            <CardDescription>
              {success
                ? 'You can sign in with your new password in a moment.'
                : ready
                  ? 'Choose a strong new password for your Savvy account.'
                  : 'Open this page from the password reset email link to continue.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <Button className="w-full" onClick={() => navigate('/auth')}>
                Go to sign in
              </Button>
            ) : ready ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                      autoFocus
                      placeholder="Enter at least 8 characters"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {password && (
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? strengthColor : 'bg-muted'}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{strengthLabel}</p>
                      <ul className="grid grid-cols-2 gap-1 text-xs">
                        {[
                          { ok: checks.length, label: '8+ characters' },
                          { ok: checks.upper, label: 'Uppercase letter' },
                          { ok: checks.number, label: 'Number' },
                          { ok: checks.special, label: 'Special character' },
                        ].map((c) => (
                          <li key={c.label} className={`flex items-center gap-1 ${c.ok ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                            {c.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            {c.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      type={showPw ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      minLength={8}
                      required
                      placeholder="Repeat your password"
                      className="pr-10"
                    />
                    {confirm && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        {matches ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <X className="w-4 h-4 text-destructive" />
                        )}
                      </span>
                    )}
                  </div>
                  {confirm && !matches && (
                    <p className="text-xs text-destructive">Passwords don't match yet.</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || !checks.length || !matches}
                >
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update password
                </Button>
                <button
                  type="button"
                  onClick={() => navigate('/auth')}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => navigate('/auth')}>
                Back to sign in
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
