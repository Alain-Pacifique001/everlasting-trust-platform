import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AuditEntry {
  id: string;
  section: string;
  changes: Record<string, unknown>;
  created_at: string;
}

const sectionVariant = (section: string) => {
  if (section === 'profile') return 'default';
  if (section === 'notifications') return 'secondary';
  return 'outline';
};

export const ActivityLog = ({ refreshKey }: { refreshKey: number }) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('settings_audit_log')
        .select('id, section, changes, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cancelled) {
        setEntries((data as AuditEntry[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Activity log
        </CardTitle>
        <CardDescription>Recent changes you made to your settings</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No changes recorded yet.
          </p>
        ) : (
          <ScrollArea className="h-64 pr-4">
            <ul className="space-y-3">
              {entries.map((e) => {
                const fields = Object.keys(e.changes || {});
                return (
                  <li key={e.id} className="border-b border-border pb-3 last:border-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge variant={sectionVariant(e.section) as any} className="capitalize">
                        {e.section}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString()}
                      </span>
                    </div>
                    {fields.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Updated: {fields.join(', ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
