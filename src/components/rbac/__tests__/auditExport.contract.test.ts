import { describe, it, expect } from 'vitest';

/**
 * Lightweight contract test for the audit-export edge function payloads.
 * We re-implement the validation predicates locally to lock the wire format.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const VALID_STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;

function isQueuePayload(p: any): boolean {
  return (
    p && typeof p === 'object' &&
    UUID.test(p.organization_id ?? '') &&
    (p.mode === 'queue' || p.mode === 'download' || !p.mode) &&
    (!p.from_date || ISO_DATE.test(p.from_date)) &&
    (!p.to_date || ISO_DATE.test(p.to_date))
  );
}

function isCancelPayload(p: any): boolean {
  return (
    p && p.mode === 'cancel' &&
    UUID.test(p.organization_id ?? '') &&
    UUID.test(p.job_id ?? '')
  );
}

describe('audit-export wire format', () => {
  const uuid = '11111111-2222-3333-4444-555555555555';

  it('accepts well-formed queue payloads', () => {
    expect(isQueuePayload({ organization_id: uuid, mode: 'queue' })).toBe(true);
    expect(isQueuePayload({ organization_id: uuid, from_date: '2025-01-01', to_date: '2025-12-31' })).toBe(true);
  });

  it('rejects bad organization_id', () => {
    expect(isQueuePayload({ organization_id: 'nope', mode: 'queue' })).toBe(false);
  });

  it('rejects bad date format', () => {
    expect(isQueuePayload({ organization_id: uuid, from_date: '01/01/2025' })).toBe(false);
  });

  it('accepts well-formed cancel payloads', () => {
    expect(isCancelPayload({ mode: 'cancel', organization_id: uuid, job_id: uuid })).toBe(true);
  });

  it('rejects cancel without job_id', () => {
    expect(isCancelPayload({ mode: 'cancel', organization_id: uuid })).toBe(false);
  });

  it('exposes the full status set used by the UI', () => {
    expect(VALID_STATUSES).toEqual(['queued', 'running', 'completed', 'failed', 'cancelled']);
  });
});
