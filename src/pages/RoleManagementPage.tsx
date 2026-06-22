import { ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganization } from '@/contexts/OrganizationContext';
import { UserManagementPanel } from '@/components/settings/UserManagementPanel';
import { OrganizationCard } from '@/components/settings/OrganizationCard';
import { MembershipRequests } from '@/components/settings/MembershipRequests';
import RolePermissionsPanel from '@/components/settings/RolePermissionsPanel';
import RolesTab from '@/components/rbac/RolesTab';
import PermissionMatrixTab from '@/components/rbac/PermissionMatrixTab';
import AuditLogTab from '@/components/rbac/AuditLogTab';
import AccessDenied from '@/components/AccessDenied';


const RoleManagementPage = () => {
  const { hasAnyRole, loading } = useOrganization();
  const isAdmin = hasAnyRole(['owner', 'ceo']);

  if (loading) return null;
  if (!isAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <AccessDenied message="Role and permission management is restricted to organization Owners and CEOs." />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Role &amp; Permission Management</h1>
          <p className="text-muted-foreground">
            Create custom roles, fine-tune the permission matrix, assign roles to users, and review the audit trail — all without touching the database.
          </p>
        </div>
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="users">User assignments</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="mt-4"><RolesTab /></TabsContent>
        <TabsContent value="permissions" className="mt-4"><PermissionMatrixTab /></TabsContent>
        <TabsContent value="users" className="mt-4"><UserManagementPanel /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditLogTab /></TabsContent>
      </Tabs>
    </div>
  );
};

export default RoleManagementPage;
