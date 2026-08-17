import { describe, expect, it } from 'vitest';
import { canAdmitParticipant, roomIsExpired, slotIsActive } from './capacity.js';

describe('capacity and reconnection', () => {
  it('admits only two unique sessions', () => {
    expect(canAdmitParticipant(1, false)).toBe(true);
    expect(canAdmitParticipant(2, false)).toBe(false);
  });
  it('always re-admits an existing valid session', () =>
    expect(canAdmitParticipant(2, true)).toBe(true));
  it('honors the reconnect grace deadline', () => {
    const now = new Date('2026-01-01T00:00:30Z');
    expect(slotIsActive(new Date('2026-01-01T00:00:31Z'), now)).toBe(true);
    expect(slotIsActive(now, now)).toBe(false);
  });
  it('never expires a room with active sessions', () => {
    const now = new Date();
    expect(roomIsExpired(new Date(now.getTime() - 1), 1, now)).toBe(false);
    expect(roomIsExpired(new Date(now.getTime() - 1), 0, now)).toBe(true);
  });
});
