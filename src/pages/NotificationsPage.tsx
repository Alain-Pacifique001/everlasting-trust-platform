import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, Check, Trash2, TrendingUp, Info, AlertTriangle, Target } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

const iconFor = (type: string) => {
  switch (type) {
    case 'price_alert': return <TrendingUp className="w-5 h-5 text-primary" />;
    case 'budget': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    case 'goal': return <Target className="w-5 h-5 text-green-500" />;
    default: return <Info className="w-5 h-5 text-muted-foreground" />;
  }
};

const NotificationsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { toast.error(error.message); return; }
    setNotifications(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchData]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    fetchData();
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    toast.success(t('notifications.allMarkedRead'));
    fetchData();
  };

  const remove = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    fetchData();
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent"><Bell className="w-6 h-6 text-accent-foreground" /></div>
          <div>
            <h1 className="text-2xl font-bold">{t('notifications.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {unread > 0 ? t('notifications.unreadCount', { count: unread }) : t('notifications.allCaughtUp')}
            </p>
          </div>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <Check className="w-4 h-4 mr-2" />{t('notifications.markAllRead')}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground text-center py-12">{t('common.loading')}</p>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Bell className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">{t('notifications.noneYet')}</p>
              <p className="text-xs text-muted-foreground mt-2">{t('notifications.setupHint')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => (
                <div key={n.id} className={`flex items-start gap-3 p-4 ${!n.read ? 'bg-accent/30' : ''}`}>
                  <div className="mt-0.5">{iconFor(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{n.title}</p>
                      {!n.read && <Badge variant="secondary" className="h-5 text-[10px]">{t('notifications.newBadge')}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                      {n.link && <Link to={n.link} className="text-primary hover:underline">{t('notifications.view')}</Link>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!n.read && (
                      <Button size="icon" variant="ghost" onClick={() => markRead(n.id)} title={t('notifications.markRead')}>
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => remove(n.id)} title={t('notifications.delete')}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationsPage;
