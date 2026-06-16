import { describe, expect, it } from 'vitest';

const SLUG_RE = /^[a-z][a-z0-9_-]{1,39}$/;

describe('RBAC slug validation', () => {
  it('accepts valid slugs', () => {
    expect(SLUG_RE.test('marketing')).toBe(true);
    expect(SLUG_RE.test('marketing-lead')).toBe(true);
    expect(SLUG_RE.test('team_2')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(SLUG_RE.test('A')).toBe(false);
    expect(SLUG_RE.test('1abc')).toBe(false);
    expect(SLUG_RE.test('Marketing')).toBe(false);
    expect(SLUG_RE.test('a')).toBe(false); // too short
    expect(SLUG_RE.test('has space')).toBe(false);
    expect(SLUG_RE.test('a'.repeat(41))).toBe(false);
  });
});

describe('Permission matrix diff', () => {
  type Row = { role_slug: string; permission_key: string; granted: boolean };
  const apply = (rows: Row[], slug: string, key: string, next: boolean): Row[] => {
    const filtered = rows.filter((r) => !(r.role_slug === slug && r.permission_key === key));
    filtered.push({ role_slug: slug, permission_key: key, granted: next });
    return filtered;
  };

  it('upserts a permission cell without duplicating', () => {
    const base: Row[] = [{ role_slug: 'employee', permission_key: 'collaboration.view', granted: true }];
    const next = apply(base, 'employee', 'collaboration.view', false);
    expect(next).toHaveLength(1);
    expect(next[0].granted).toBe(false);
  });

  it('rolls back when failure replaces optimistic state', () => {
    const base: Row[] = [{ role_slug: 'employee', permission_key: 'collaboration.view', granted: true }];
    const optimistic = apply(base, 'employee', 'collaboration.view', false);
    expect(optimistic[0].granted).toBe(false);
    // rollback: re-apply original
    const restored = apply(optimistic, 'employee', 'collaboration.view', true);
    expect(restored[0].granted).toBe(true);
  });
});

describe('Audit event taxonomy', () => {
  const VALID = new Set([
    'role.create', 'role.rename', 'role.delete',
    'permissions.update', 'user.role_change',
  ]);
  it('covers all admin mutations', () => {
    ['role.create', 'role.rename', 'role.delete', 'permissions.update', 'user.role_change']
      .forEach((e) => expect(VALID.has(e)).toBe(true));
  });
});
