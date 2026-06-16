import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function AccessDenied({ message }: { message?: string }) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="p-6 flex items-start gap-3">
        <div className="size-10 rounded-lg bg-destructive/10 grid place-items-center shrink-0">
          <ShieldAlert className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h3 className="font-semibold">Access restricted</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {message ?? "You don't have permission to view this module. Contact an administrator if you need access."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
