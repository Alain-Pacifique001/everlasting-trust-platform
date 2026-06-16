# Role & Permission Management System

A comprehensive RBAC overhaul building on the existing `organization_members`, `role_permissions`, and `module-guard` foundation.

## 1. Database schema (new migration)

New tables (all under `public`, with GRANTs + RLS + admin-only policies via `has_any_role(auth.uid(), org, ARRAY['owner','ceo'])`):

- **`custom_roles`** — `id, organization_id, slug, name, description, is_system bool, created_by, created_at, updated_at`. Unique `(organization_id, slug)`. `is_system=true` rows (seeded: owner, ceo, cfo, …) cannot be renamed/deleted.
- **`permissions`** — catalog of `{key, module, action, label, description}`. Seeded with `collaboration.view/manage`, `voice_briefings.view/manage`, `roles.manage`, `audit.view`, plus room for more.
- **`custom_role_permissions`** — junction `(organization_id, role_slug, permission_key)` with `granted bool`. Replaces/extends the current `role_permissions` table for arbitrary permission keys (the existing table stays for module view/manage to keep `useModuleAccess` working; new table powers the catalog UI).
- **`rbac_audit_log`** — `id, organization_id, actor_user_id, actor_email, event_type, target_role, target_user_id, previous_value jsonb, new_value jsonb, metadata jsonb, ip_address inet, created_at`. Indexed on `(organization_id, created_at desc)`, `event_type`, `actor_user_id`.

Helper SQL functions (SECURITY DEFINER):
- `rbac_log_event(...)` — inserts an audit row.
- `has_permission(_user_id, _org_id, _permission_key)` — checks effective permission for a user (membership role → custom_role_permissions → fallback to defaults). Used by edge guard + RLS where appropriate.
- `delete_custom_role(_org, _slug)` — refuses if `is_system` or in use.

System roles seeded per org via trigger on `organizations` insert.

## 2. Backend enforcement

- Extend `supabase/functions/module-guard` to accept `permission` (free-form key) in addition to `module + action`, and resolve via `has_permission()`.
- Add new edge function **`rbac-admin`** for privileged role/permission writes (create/rename/delete role, bulk permission updates, user role assignment). It:
  - Authenticates the JWT.
  - Confirms caller has `roles.manage`.
  - Performs the mutation with the service role.
  - Writes an `rbac_audit_log` row including IP from `x-forwarded-for`.
  - Returns 401/403/409/429 with clear messages.
- Rate-limit (token bucket) the admin function: 60 req/min/user.

## 3. Frontend — Role Management page

Rebuild `/roles` (`RoleManagementPage.tsx`) with tabbed layout:

1. **Roles** — list system + custom roles, "New role" dialog, inline rename, delete with confirmation `AlertDialog`. Validation: slug unique, 2-40 chars, kebab-case.
2. **Permission Matrix** — rows = roles, columns = permissions grouped by module. Switches with optimistic update; on failure roll back + toast. "Save all" + per-cell auto-save toggle.
3. **User Assignments** — extend `UserManagementPanel`: per-member dropdown to assign/replace role (incl. custom roles), "Remove from organization" with confirmation.
4. **Audit Log** — searchable table (event type filter, date range, actor search, pagination 25/page, CSV export). Uses `rbac_audit_log` via Supabase client.

New components:
- `src/components/rbac/RolesTab.tsx`
- `src/components/rbac/PermissionMatrixTab.tsx`
- `src/components/rbac/AssignmentsTab.tsx`
- `src/components/rbac/AuditLogTab.tsx`
- `src/components/rbac/RoleFormDialog.tsx`
- `src/components/rbac/ConfirmDestructiveDialog.tsx` (wraps shadcn AlertDialog)

Shared:
- `src/hooks/useRoles.ts`, `src/hooks/usePermissions.ts`, `src/hooks/useAuditLog.ts` — React Query–style fetch + optimistic mutations (using local cache; no new deps).
- Zod schemas in `src/lib/rbacSchemas.ts` for client validation.

## 4. Permission enforcement on the client

- Replace `useModuleAccess` internals to read `custom_role_permissions` via new `has_permission` RPC, falling back to the existing `role_permissions` table and defaults.
- Add `usePermission(key)` hook used by sensitive buttons (e.g. "Record briefing", "Send message") to hide/disable when denied.

## 5. Audit logging hooks

Every admin mutation funnels through `rbac-admin` which logs automatically. Client-side, after success we invalidate `useAuditLog` cache so the dashboard updates live.

## 6. Tests

- **Vitest unit** (`src/components/rbac/__tests__/`):
  - Role slug validation
  - Optimistic update rollback on simulated failure
  - Permission matrix diff computation
- **Playwright E2E** (`e2e/rbac.spec.ts`):
  - Owner creates "marketing" role → appears after refresh
  - Toggle `voice_briefings.manage` off → assigned user loses Record button
  - Delete custom role blocked while assigned, allowed after reassignment
  - Non-admin gets 403 from `rbac-admin`
  - Audit log shows the create/rename/delete entries with correct actor
- **Deno edge tests** (`supabase/functions/rbac-admin/index_test.ts`):
  - Unauthorized → 401
  - Non-admin → 403
  - Rate limit → 429 after 60 calls
  - Successful create writes audit row

## 7. Documentation

- `docs/rbac.md` — schema diagram (ASCII), permission key catalog, how to add a new permission, enforcement flow, audit log queries.
- Update `e2e/README.md` with the new spec.

## Technical notes

- All migrations follow the required GRANT → ENABLE RLS → POLICY order.
- `is_system` roles are seeded by inserting on org creation via trigger update to `handle_new_organization`.
- IP capture relies on `x-forwarded-for`; falls back to `null`.
- No new npm dependencies (uses existing shadcn, lucide, zod, Playwright, Vitest).
- The existing `role_permissions` table remains the source of truth for `useModuleAccess` to avoid regressions; `custom_role_permissions` is additive and used by the new matrix UI + `has_permission`. A second migration can later collapse them.

## Out of scope (call out)

- Multi-org permission inheritance.
- Time-bound / scheduled role assignments.
- SSO/SAML role mapping (separate effort).

Approve to proceed and I will ship migrations, edge functions, UI, and tests in one pass.
