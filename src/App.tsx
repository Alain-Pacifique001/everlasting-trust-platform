import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { OrganizationProvider, useOrganization } from "@/contexts/OrganizationContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import AppLayout from "@/components/layout/AppLayout";
import Landing from "./pages/Landing";
import Index from "./pages/Index";
import OnboardingOrg from "./pages/OnboardingOrg";
import TasksPage from "./pages/TasksPage";
import Expenses from "./pages/Expenses";
import Budgets from "./pages/Budgets";
import Savings from "./pages/Savings";
import AIInsights from "./pages/AIInsights";
import PortfolioPage from "./pages/PortfolioPage";
import MarketDataPage from "./pages/MarketDataPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import NotificationsPage from "./pages/NotificationsPage";
import SettingsPage from "./pages/SettingsPage";
import RoleManagementPage from "./pages/RoleManagementPage";
import RoleRequestsPage from "./pages/RoleRequestsPage";
import SignupRoleConfigPage from "./pages/SignupRoleConfigPage";
import EnterprisePage from "./pages/EnterprisePage";
import AuthPage from "./pages/AuthPage";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import "./i18n";

const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <OrganizationProvider>
      <CurrencyProvider>
        <PreferencesProvider>
          <OrgGate />
        </PreferencesProvider>
      </CurrencyProvider>
    </OrganizationProvider>
  );
};

const OrgGate = () => {
  const { organization, loading } = useOrganization();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!organization) return <OnboardingOrg />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/savings" element={<Savings />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/market" element={<MarketDataPage />} />
        <Route path="/ai-insights" element={<AIInsights />} />
        {/* Legacy redirects */}
        <Route path="/finance-advisor" element={<Navigate to="/ai-insights" replace />} />
        <Route path="/portfolio-advisor" element={<Navigate to="/ai-insights" replace />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/organization" element={<EnterprisePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/roles" element={<RoleManagementPage />} />
        <Route path="/role-requests" element={<RoleRequestsPage />} />
        <Route path="/signup-roles" element={<SignupRoleConfigPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
};

const AuthRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <AuthPage />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard/*" element={<ProtectedRoutes />} />
              {/* Legacy: redirect old top-level dashboard paths */}
              <Route path="/expenses" element={<Navigate to="/dashboard/expenses" replace />} />
              <Route path="/budgets" element={<Navigate to="/dashboard/budgets" replace />} />
              <Route path="/savings" element={<Navigate to="/dashboard/savings" replace />} />
              <Route path="/tasks" element={<Navigate to="/dashboard/tasks" replace />} />
              <Route path="/portfolio" element={<Navigate to="/dashboard/portfolio" replace />} />
              <Route path="/market" element={<Navigate to="/dashboard/market" replace />} />
              <Route path="/ai-insights" element={<Navigate to="/dashboard/ai-insights" replace />} />
              <Route path="/analytics" element={<Navigate to="/dashboard/analytics" replace />} />
              <Route path="/notifications" element={<Navigate to="/dashboard/notifications" replace />} />
              <Route path="/organization" element={<Navigate to="/dashboard/organization" replace />} />
              <Route path="/settings" element={<Navigate to="/dashboard/settings" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
