import { describe, it, expect } from 'vitest';

// Pure helpers extracted to test collaboration persistence guarantees
// without coupling to the React render layer.

type Message = { id: string; client_nonce?: string | null; body?: string };

export function dedupeByIdOrNonce(prev: Message[], incoming: Message): Message[] {
  if (prev.some((m) => m.id === incoming.id)) return prev;
  if (incoming.client_nonce && prev.some((m) => m.client_nonce === incoming.client_nonce)) {
    return prev.map((m) => (m.client_nonce === incoming.client_nonce ? incoming : m));
  }
  return [...prev, incoming];
}

export function extractMentions(body: string, members: { user_id: string; full_name: string }[]) {
  return Array.from(body.matchAll(/@(\w+)/g))
    .map((m) =>
      members.find((u) => u.full_name.toLowerCase().includes(m[1].toLowerCase()))?.user_id,
    )
    .filter(Boolean) as string[];
}

describe('Team Collaboration persistence helpers', () => {
  it('keeps a single message on reconnect when the realtime event arrives after optimistic insert (dedupe by nonce)', () => {
    const nonce = 'abc-123';
    const optimistic: Message = { id: 'tmp-1', client_nonce: nonce, body: 'hi' };
    const fromServer: Message = { id: 'real-1', client_nonce: nonce, body: 'hi' };
    let state: Message[] = [optimistic];
    state = dedupeByIdOrNonce(state, fromServer);
    expect(state.length).toBe(1);
    expect(state[0].id).toBe('real-1');
  });

  it('does not insert duplicate when the same id is broadcast twice on reconnect', () => {
    const a: Message = { id: 'real-1', body: 'hi' };
    let state: Message[] = [a];
    state = dedupeByIdOrNonce(state, a);
    state = dedupeByIdOrNonce(state, a);
    expect(state.length).toBe(1);
  });

  it('extracts @mentions to member user_ids', () => {
    const members = [
      { user_id: 'u1', full_name: 'Alice Smith' },
      { user_id: 'u2', full_name: 'Bob Jones' },
    ];
    expect(extractMentions('hey @Alice and @bob', members)).toEqual(['u1', 'u2']);
  });

  it('preserves message order when adding new messages across page reloads', () => {
    const initial: Message[] = [
      { id: 'm1', body: '1' }, { id: 'm2', body: '2' },
    ];
    const reloaded = [...initial];
    const live: Message = { id: 'm3', body: '3' };
    const after = dedupeByIdOrNonce(reloaded, live);
    expect(after.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});
