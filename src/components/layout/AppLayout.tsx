import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Receipt, PiggyBank, Target, Sparkles,
  Briefcase, TrendingUp, BarChart3, Bell, ListChecks,
  Settings, ChevronLeft, ChevronRight, LogOut, Building2, Network, Menu, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import LanguageSelector from '@/components/LanguageSelector';
import ThemeToggle from '@/components/ThemeToggle';
import { OrgSwitcher } from '@/components/layout/OrgSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

const SignOutButton = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  return (
    <button
      onClick={signOut}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full transition-all duration-200 text-destructive hover:bg-destructive/10',
        collapsed && 'justify-center px-2'
      )}
    >
      <LogOut className="w-5 h-5 shrink-0" />
      {!collapsed && <span>{t('nav.signOut')}</span>}
    </button>
  );
};

const SidebarBody = ({
  collapsed,
  onNavigate,
  unreadCount,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  unreadCount: number;
}) => {
  const { t } = useTranslation();
  const { organization, hasAnyRole } = useOrganization();
  const location = useLocation();
  const isAdmin = hasAnyRole(['owner', 'ceo']);

  const financeItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/dashboard/tasks', icon: ListChecks, label: t('nav.tasks') },
    { to: '/dashboard/expenses', icon: Receipt, label: t('nav.expenses') },
    { to: '/dashboard/budgets', icon: PiggyBank, label: t('nav.budgets') },
    { to: '/dashboard/savings', icon: Target, label: t('nav.savings') },
  ];
  const portfolioItems = [
    { to: '/dashboard/portfolio', icon: Briefcase, label: t('nav.portfolio') },
    { to: '/dashboard/market', icon: TrendingUp, label: t('nav.market') },
    { to: '/dashboard/analytics', icon: BarChart3, label: t('nav.analytics') },
    { to: '/dashboard/ai-insights', icon: Sparkles, label: t('nav.aiInsights') },
    { to: '/dashboard/notifications', icon: Bell, label: t('nav.notifications') },
    { to: '/dashboard/organization', icon: Network, label: 'Organization' },
    ...(isAdmin ? [{ to: '/dashboard/roles', icon: ShieldCheck, label: 'Role Management' }] : []),
    { to: '/dashboard/settings', icon: Settings, label: t('nav.settings') },
  ];

  const renderNavItem = ({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) => {
    const isActive = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to));
    const showBadge = to === '/dashboard/notifications' && unreadCount > 0;
    return (
      <Link
        key={to}
        to={to}
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative min-h-11',
          isActive ? 'bg-primary text-primary-foreground shadow-sm'
                   : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          collapsed && 'justify-center px-2'
        )}
      >
        <div className="relative shrink-0">
          <Icon className="w-5 h-5" />
          {showBadge && collapsed && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        {!collapsed && <span className="flex-1">{label}</span>}
        {showBadge && !collapsed && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {organization && (
        <div className="px-2 py-2 border-b border-border bg-accent/30">
          <OrgSwitcher collapsed={collapsed} />
          {!collapsed && (
            <div className="px-2 pt-1 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-sm font-semibold truncate">{organization.name}</p>
            </div>
          )}
        </div>
      )}
      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        <div>
          {!collapsed && (
            <p className="text-xs font-semibold text-muted-foreground mb-2 px-3">{t('nav.finance')}</p>
          )}
          <div className="space-y-1">{financeItems.map(renderNavItem)}</div>
        </div>
        <div>
          {!collapsed && (
            <p className="text-xs font-semibold text-muted-foreground mb-2 px-3">{t('nav.investment')}</p>
          )}
          <div className="space-y-1">{portfolioItems.map(renderNavItem)}</div>
        </div>
      </nav>
      <div className="p-3 border-t border-border space-y-2">
        <ThemeToggle collapsed={collapsed} />
        <LanguageSelector collapsed={collapsed} />
        <SignOutButton collapsed={collapsed} />
      </div>
    </>
  );
};

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      setUnreadCount(count ?? 0);
    };
    fetchCount();
    const channel = supabase
      .channel('layout-notif-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <div className="flex h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-border bg-card transition-all duration-300',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          {!collapsed && (
            <Link to="/" className="text-xl font-bold bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
              Savvy AI
            </Link>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
        <SidebarBody collapsed={collapsed} unreadCount={unreadCount} />
      </aside>

      {/* Mobile sheet sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col">
          <div className="flex items-center p-4 border-b border-border">
            <Link to="/" className="text-xl font-bold bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
              Savvy AI
            </Link>
          </div>
          <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} unreadCount={unreadCount} />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center gap-2 px-3 h-14 border-b border-border bg-card sticky top-0 z-30">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9"><Menu className="w-5 h-5" /></Button>
            </SheetTrigger>
          </Sheet>
          <Link to="/dashboard" className="font-bold bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
            Savvy AI
          </Link>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};

export default AppLayout;
