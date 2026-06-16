# Role & Permission Management

The admin RBAC system lets owners/CEOs define custom roles, fine-tune the
permission matrix, assign users, and audit every change — all from the
`/roles` page.

## Architecture

```
custom_roles ─────┐
                  │   organization_id + role_slug
permissions ──────┴─→ custom_role_permissions
                                │
                                ▼
                  has_permission(user, org, key)
                                │
            ┌───────────────────┴───────────────────┐
            ▼                                       ▼
       Edge guard                                Client UI
   (module-guard,                          (usePermission hook,
    rbac-admin)                            useModuleAccess)
                                │
                                ▼
                         rbac_audit_log
```

## Tables

| Table | Purpose |
|---|---|
| `custom_roles` | Per-org roles, with `is_system` flag for protected ones |
| `permissions` | Global catalog of permission keys |
| `custom_role_permissions` | `(org, role_slug, permission_key) → granted` |
| `rbac_audit_log` | Every admin write: actor, before/after, IP |

## Permission keys

| Key | Description |
|---|---|
| `collaboration.view` | See team threads/messages |
| `collaboration.manage` | Create threads, delete messages |
| `voice_briefings.view` | Listen to briefings |
| `voice_briefings.manage` | Record / assign briefings |
| `roles.manage` | Use this admin page |
| `audit.view` | View audit log |

To add a new key: `INSERT INTO public.permissions (...)` via migration, then
update the `DEFAULT_FALLBACK` map in `PermissionMatrixTab.tsx` and the
`has_permission` DB function.

## Enforcement

- **Frontend** — `useModuleAccess(mod)` hides denied UI.
- **Edge** — `module-guard` validates the JWT, looks up
  `custom_role_permissions`, returns 403 / 429.
- **Database** — RLS policies on collaboration/voice tables use
  `has_any_role` and the membership check.
- **Admin writes** — all role/permission mutations go through the
  `rbac-admin` edge function which writes an audit row.

## Rate limits

- `module-guard`: 30 req/min view, 10 req/min manage.
- `rbac-admin`: 60 req/min per user.

## Audit log

```sql
select event_type, actor_email, target_role, created_at
from rbac_audit_log
where organization_id = :org
order by created_at desc
limit 50;
```

The Audit tab in `/roles` provides search, filtering, pagination, and CSV
export. Logs persist forever (no purge job).

## System roles

Owner is always all-powerful (DB short-circuits `has_permission`). The other
seeded roles (CEO, CFO, finance_manager, …) can be re-permissioned but not
renamed or deleted.
