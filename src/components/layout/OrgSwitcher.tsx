import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganization } from '@/contexts/OrganizationContext';
import { cn } from '@/lib/utils';

export const OrgSwitcher = ({ collapsed }: { collapsed: boolean }) => {
  const { organization, memberships, switchOrganization, role } = useOrganization();
  if (!organization) return null;
  if (memberships.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-2 px-2 py-2 h-auto',
            collapsed && 'justify-center',
          )}
        >
          <Building2 className="w-4 h-4 shrink-0 text-primary" />
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium truncate">{organization.name}</p>
              {role && <p className="text-[10px] text-muted-foreground capitalize">{role.replace('_', ' ')}</p>}
            </div>
          )}
          {!collapsed && <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.organization.id}
            onClick={() => switchOrganization(m.organization.id)}
            className="flex items-center gap-2"
          >
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{m.organization.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{m.role.replace('_', ' ')}</p>
            </div>
            {m.organization.id === organization.id && <Check className="w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
