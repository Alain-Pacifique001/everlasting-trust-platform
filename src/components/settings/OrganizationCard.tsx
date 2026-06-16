import { useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/contexts/OrganizationContext';

export const OrganizationCard = () => {
  const { organization, role, loading } = useOrganization();
  const navigate = useNavigate();

  if (loading) return null;

  if (!organization) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            No organization yet
          </CardTitle>
          <CardDescription>
            You need to belong to an organization to access financial features.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate('/dashboard')} className="flex items-center gap-2">
            Complete onboarding <ArrowRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Organization
        </CardTitle>
        <CardDescription>Your active workspace and role</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{organization.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{organization.type}</p>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span className="capitalize">{role}</span>
          </Badge>
        </div>
        {organization.description && (
          <p className="text-sm text-muted-foreground">{organization.description}</p>
        )}
      </CardContent>
    </Card>
  );
};
