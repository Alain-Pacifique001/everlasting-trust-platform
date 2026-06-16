import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Loader2, ShieldCheck, Lock } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { CustomRole, callRbacAdmin, useRoles } from '@/hooks/useRbac';

const SLUG_RE = /^[a-z][a-z0-9_-]{1,39}$/;

export default function RolesTab() {
  const { roles, loading, refresh } = useRoles();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [deleting, setDeleting] = useState<CustomRole | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-primary" /> Roles
          </CardTitle>
          <CardDescription>System roles are protected. Create custom roles to model your team.</CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> New role</Button>
          </DialogTrigger>
          <RoleFormDialog
            mode="create"
            onClose={() => setCreateOpen(false)}
            onSaved={async () => { setCreateOpen(false); await refresh(); }}
          />
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.slug}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md truncate">{r.description || '—'}</TableCell>
                    <TableCell>
                      {r.is_system
                        ? <Badge variant="outline" className="gap-1"><Lock className="w-3 h-3" /> System</Badge>
                        : <Badge variant="secondary">Custom</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-8 w-8"
                        disabled={r.is_system} onClick={() => setEditing(r)}
                        title={r.is_system ? 'System role' : 'Rename'}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={r.is_system} onClick={() => setDeleting(r)}
                        title={r.is_system ? 'System role' : 'Delete'}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editing && (
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <RoleFormDialog
            mode="edit"
            role={editing}
            onClose={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await refresh(); }}
          />
        </Dialog>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the role and any permission overrides attached to it. Members currently holding this role keep their access until you reassign them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await callRbacAdmin({ action: 'delete_role', slug: deleting.slug });
                  toast.success(`Deleted "${deleting.name}"`);
                  await refresh();
                } catch (e: any) {
                  toast.error(e.message);
                } finally {
                  setDeleting(null);
                }
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RoleFormDialog({
  mode, role, onClose, onSaved,
}: {
  mode: 'create' | 'edit';
  role?: CustomRole;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(role?.slug ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const cleanSlug = slug.toLowerCase().trim();
    if (mode === 'create' && !SLUG_RE.test(cleanSlug)) {
      toast.error('Slug must be lowercase, 2-40 chars, letters/digits/_/-');
      return;
    }
    if (name.trim().length < 2) { toast.error('Name too short'); return; }
    setSaving(true);
    try {
      if (mode === 'create') {
        await callRbacAdmin({ action: 'create_role', slug: cleanSlug, name: name.trim(), description: description.trim() });
        toast.success('Role created');
      } else {
        await callRbacAdmin({ action: 'rename_role', slug: role!.slug, name: name.trim(), description: description.trim() });
        toast.success('Role updated');
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{mode === 'create' ? 'New role' : `Edit "${role?.name}"`}</DialogTitle>
        <DialogDescription>
          {mode === 'create'
            ? 'Custom roles are scoped to your organization. Configure their permissions in the next tab.'
            : 'Update the role name and description.'}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Slug</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="marketing-lead" disabled={mode === 'edit'} />
        </div>
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing Lead" />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description ?? ''} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving} className="gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
