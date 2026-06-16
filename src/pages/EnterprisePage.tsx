import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building, Users, IdCard, Network } from 'lucide-react';
import { DepartmentsPanel } from '@/components/enterprise/DepartmentsPanel';
import { TeamsPanel } from '@/components/enterprise/TeamsPanel';
import { EmployeesPanel } from '@/components/enterprise/EmployeesPanel';
import { OrgChart } from '@/components/enterprise/OrgChart';
import { useOrganization } from '@/contexts/OrganizationContext';

const EnterprisePage = () => {
  const { organization } = useOrganization();
  if (!organization) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization</h1>
        <p className="text-muted-foreground">Departments, teams, employees, and your reporting hierarchy.</p>
      </div>

      <Tabs defaultValue="chart" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="chart" className="flex items-center gap-2">
            <Network className="w-4 h-4" /> <span className="hidden sm:inline">Org chart</span>
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-2">
            <Building className="w-4 h-4" /> <span className="hidden sm:inline">Departments</span>
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> <span className="hidden sm:inline">Teams</span>
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <IdCard className="w-4 h-4" /> <span className="hidden sm:inline">Employees</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chart"><OrgChart /></TabsContent>
        <TabsContent value="departments"><DepartmentsPanel /></TabsContent>
        <TabsContent value="teams"><TeamsPanel /></TabsContent>
        <TabsContent value="employees"><EmployeesPanel /></TabsContent>
      </Tabs>
    </div>
  );
};

export default EnterprisePage;
