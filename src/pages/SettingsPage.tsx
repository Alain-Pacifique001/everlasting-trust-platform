import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Palette, Shield, Save, Loader2, BellRing, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency, CurrencyCode } from '@/contexts/CurrencyContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { SettingsSkeleton } from '@/components/settings/SettingsSkeleton';
import { ActivityLog } from '@/components/settings/ActivityLog';
import { TwoFactorAuth } from '@/components/settings/TwoFactorAuth';
import { RecoveryCodes } from '@/components/settings/RecoveryCodes';
import { TotpChallenge } from '@/components/settings/TotpChallenge';
import TelemetryPanel from '@/components/settings/TelemetryPanel';

import { useOrganization } from '@/contexts/OrganizationContext';
import { requestPushPermission, sendNotification, watchNotificationPermission, NotificationCategory } from '@/lib/notify';

const diffObject = <T extends Record<string, any>>(prev: T, next: T): Partial<T> => {
  const out: Record<string, any> = {};
  for (const k of Object.keys(next)) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out[k] = next[k];
  }
  return out as Partial<T>;
};

const SettingsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { setCurrency: setGlobalCurrency } = useCurrency();
  const { refresh: refreshPrefs } = usePreferences();
  const { isViewer } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditRefresh, setAuditRefresh] = useState(0);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );
  const [testingCategory, setTestingCategory] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingPasswordChange, setPendingPasswordChange] = useState<string | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);

  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    phone: '',
    bio: '',
    currency: 'USD',
  });
  const [initialProfile, setInitialProfile] = useState(profile);

  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    pushNotifications: true,
    budgetWarnings: true,
    weeklyReport: false,
    marketAlerts: true,
    goalReminders: true,
  });
  const [initialNotifications, setInitialNotifications] = useState(notifications);

  const [preferences, setPreferences] = useState({
    dateFormat: 'MM/DD/YYYY',
    startOfWeek: 'monday',
    compactView: false,
    showBalances: true,
  });
  const [initialPreferences, setInitialPreferences] = useState(preferences);

  const logAudit = async (section: string, changes: Record<string, unknown>) => {
    if (!user || Object.keys(changes).length === 0) return;
    await supabase.from('settings_audit_log').insert({
      user_id: user.id,
      section,
      changes: changes as any,
    });
    setAuditRefresh((n) => n + 1);
  };

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      const [profileRes, settingsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      if (profileRes.data) {
        const next = {
          fullName: profileRes.data.full_name || '',
          email: profileRes.data.email || user.email || '',
          phone: profileRes.data.phone || '',
          bio: profileRes.data.bio || '',
          currency: profileRes.data.currency || 'USD',
        };
        setProfile(next);
        setInitialProfile(next);
      } else {
        const next = { ...profile, email: user.email || '' };
        setProfile(next);
        setInitialProfile(next);
      }

      if (settingsRes.data) {
        const notifs = settingsRes.data.notifications as any;
        const prefs = settingsRes.data.preferences as any;
        if (notifs) {
          const merged = { ...notifications, ...notifs };
          setNotifications(merged);
          setInitialNotifications(merged);
        }
        if (prefs) {
          const merged = { ...preferences, ...prefs };
          setPreferences(merged);
          setInitialPreferences(merged);
        }
      }

      setLoading(false);
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Live-detect browser notification permission changes (no manual refresh needed)
  useEffect(() => {
    return watchNotificationPermission(setPushPermission);
  }, []);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').upsert({
      user_id: user.id,
      full_name: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      bio: profile.bio,
      currency: profile.currency,
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) { console.error(error); toast.error(t('settings.saveFailed')); return; }
    const changes = diffObject(initialProfile, profile);
    await logAudit('profile', changes);
    setInitialProfile(profile);
    await setGlobalCurrency(profile.currency as CurrencyCode);
    toast.success(t('settings.saved'));
  };

  const handleSaveNotifications = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      notifications: notifications as any,
      preferences: preferences as any,
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) { console.error(error); toast.error(t('settings.saveFailed')); return; }
    const changes = diffObject(initialNotifications, notifications);
    await logAudit('notifications', changes);
    setInitialNotifications(notifications);
    await refreshPrefs();
    // If user enabled push, request browser permission
    if (notifications.pushNotifications && pushPermission === 'default') {
      const result = await requestPushPermission();
      setPushPermission(result);
    }
    toast.success(t('settings.notificationsSaved'));
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      notifications: notifications as any,
      preferences: preferences as any,
    }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) { console.error(error); toast.error(t('settings.saveFailed')); return; }
    const changes = diffObject(initialPreferences, preferences);
    await logAudit('preferences', changes);
    setInitialPreferences(preferences);
    await refreshPrefs();
    toast.success(t('settings.preferencesSaved'));
  };

  const handleEnablePush = async () => {
    const result = await requestPushPermission();
    setPushPermission(result);
    if (result === 'granted') toast.success(t('settings.pushEnabled'));
    else if (result === 'denied') toast.error(t('settings.pushDenied'));
  };

  const handleSendTest = async (category: NotificationCategory, label: string) => {
    if (!user) return;
    setTestingCategory(category);
    const result = await sendNotification({
      userId: user.id,
      title: `Test: ${label}`,
      message: `This is a test for the "${label}" category. Channel preferences are working.`,
      type: category,
      prefs: notifications,
    });
    setTestingCategory(null);
    if (result.delivered) toast.success(`${label} test sent.`);
    else toast.error(`${label} is disabled. Enable it above to receive this notification.`);
  };

  const performPasswordChange = async (newPw: string) => {
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit('security', { password: 'updated' });
    (document.getElementById('newPassword') as HTMLInputElement).value = '';
    (document.getElementById('confirmPassword') as HTMLInputElement).value = '';
    setPendingPasswordChange(null);
    toast.success(t('settings.passwordUpdated'));
  };

  const handleChangePassword = async () => {
    const newPw = (document.getElementById('newPassword') as HTMLInputElement)?.value;
    const confirmPw = (document.getElementById('confirmPassword') as HTMLInputElement)?.value;
    if (!newPw || newPw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { toast.error(t('settings.passwordMismatch')); return; }

    if (twoFactorEnabled) {
      // Gate behind a TOTP challenge
      setPendingPasswordChange(newPw);
      setChallengeOpen(true);
      return;
    }
    await performPasswordChange(newPw);
  };

  if (loading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {isViewer && (
        <Alert>
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            You're signed in as a <strong>Viewer</strong>. You can browse data but can't add, edit, or delete records.
            Ask the organization owner to upgrade your role to make changes.
          </AlertDescription>
        </Alert>
      )}

      <TelemetryPanel />

      <Tabs defaultValue="preferences" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            <span className="hidden sm:inline">{t('settings.preferences')}</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">{t('settings.notifications')}</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">{t('settings.security')}</span>
          </TabsTrigger>
        </TabsList>


        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.appPreferences')}</CardTitle>
              <CardDescription>{t('settings.preferencesDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.dateFormat')}</Label>
                  <Select value={preferences.dateFormat} onValueChange={(v) => setPreferences({ ...preferences, dateFormat: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.startOfWeek')}</Label>
                  <Select value={preferences.startOfWeek} onValueChange={(v) => setPreferences({ ...preferences, startOfWeek: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">{t('settings.monday')}</SelectItem>
                      <SelectItem value="sunday">{t('settings.sunday')}</SelectItem>
                      <SelectItem value="saturday">{t('settings.saturday')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('settings.compactView')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.compactViewDesc')}</p>
                  </div>
                  <Switch checked={preferences.compactView} onCheckedChange={(v) => setPreferences({ ...preferences, compactView: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('settings.showBalances')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.showBalancesDesc')}</p>
                  </div>
                  <Switch checked={preferences.showBalances} onCheckedChange={(v) => setPreferences({ ...preferences, showBalances: v })} />
                </div>
              </div>
              <Button onClick={handleSavePreferences} disabled={saving || isViewer} className="flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('settings.save')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.notificationSettings')}</CardTitle>
              <CardDescription>{t('settings.notificationDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pushPermission === 'unsupported' && (
                <Alert>
                  <AlertTitle>{t('settings.pushUnsupportedTitle')}</AlertTitle>
                  <AlertDescription>{t('settings.pushUnsupportedDesc')}</AlertDescription>
                </Alert>
              )}
              {pushPermission === 'denied' && (
                <Alert variant="destructive">
                  <AlertTitle>{t('settings.pushBlockedTitle')}</AlertTitle>
                  <AlertDescription>{t('settings.pushBlockedDesc')}</AlertDescription>
                </Alert>
              )}
              {pushPermission === 'default' && notifications.pushNotifications && (
                <Alert>
                  <AlertTitle>{t('settings.pushPermissionTitle')}</AlertTitle>
                  <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
                    <span>{t('settings.pushPermissionDesc')}</span>
                    <Button size="sm" variant="outline" onClick={handleEnablePush}>
                      <BellRing className="w-4 h-4 mr-2" />{t('settings.enablePush')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {pushPermission === 'granted' && (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <BellRing className="w-4 h-4" />
                  <span>{t('settings.pushReady')}</span>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    {t('settings.active')}
                  </Badge>
                </div>
              )}

              {([
                { key: 'emailAlerts', label: t('settings.emailAlerts'), desc: t('settings.emailAlertsDesc'), test: null },
                { key: 'pushNotifications', label: t('settings.pushNotifications'), desc: t('settings.pushNotificationsDesc'), test: 'info' as NotificationCategory },
                { key: 'budgetWarnings', label: t('settings.budgetWarnings'), desc: t('settings.budgetWarningsDesc'), test: 'budget' as NotificationCategory },
                { key: 'weeklyReport', label: t('settings.weeklyReport'), desc: t('settings.weeklyReportDesc'), test: null },
                { key: 'marketAlerts', label: t('settings.marketAlerts'), desc: t('settings.marketAlertsDesc'), test: 'price_alert' as NotificationCategory },
                { key: 'goalReminders', label: t('settings.goalReminders'), desc: t('settings.goalRemindersDesc'), test: 'goal' as NotificationCategory },
              ] as const).map(({ key, label, desc, test }) => (
                <div key={key} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {test && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSendTest(test, label)}
                        disabled={testingCategory === test}
                        title={`Send test ${label} notification`}
                      >
                        {testingCategory === test ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                      </Button>
                    )}
                    <Switch
                      checked={notifications[key as keyof typeof notifications]}
                      onCheckedChange={(v) => setNotifications({ ...notifications, [key]: v })}
                    />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button onClick={handleSaveNotifications} disabled={saving || isViewer} className="flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('settings.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.securitySettings')}</CardTitle>
              <CardDescription>{t('settings.securityDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">{t('settings.passwordSection')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">{t('settings.newPassword')}</Label>
                    <div className="relative">
                      <Input id="newPassword" type={showNewPassword ? 'text' : 'password'} placeholder="••••••••" className="pr-10" />
                      <button type="button" onClick={() => setShowNewPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showNewPassword ? 'Hide password' : 'Show password'}>
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t('settings.confirmPassword')}</Label>
                    <div className="relative">
                      <Input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••" className="pr-10" />
                      <button type="button" onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                {twoFactorEnabled && (
                  <p className="text-xs text-muted-foreground mt-2">You'll be asked for a 2FA code before the password is changed.</p>
                )}
                <Button onClick={handleChangePassword} disabled={saving} className="mt-4 flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('settings.updatePassword')}
                </Button>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">{t('settings.twoFactor.section')}</h3>
                <TwoFactorAuth onStatusChange={setTwoFactorEnabled} />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Recovery codes</h3>
                <RecoveryCodes twoFactorEnabled={twoFactorEnabled} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      
      <ActivityLog refreshKey={auditRefresh} />

      <TotpChallenge
        open={challengeOpen}
        onOpenChange={(o) => { setChallengeOpen(o); if (!o) setPendingPasswordChange(null); }}
        onVerified={() => { if (pendingPasswordChange) performPasswordChange(pendingPasswordChange); }}
        title="Confirm password change"
        description="Enter your 2FA code to confirm this sensitive change."
      />
    </div>
  );
};

export default SettingsPage;
