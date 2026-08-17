export function canAdmitParticipant(
  activeUniqueSessions: number,
  hasExistingSession: boolean,
): boolean {
  return hasExistingSession || activeUniqueSessions < 2;
}

export function slotIsActive(activeUntil: Date, now = new Date()): boolean {
  return activeUntil.getTime() > now.getTime();
}

export function roomIsExpired(expiresAt: Date, activeSessions: number, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime() && activeSessions === 0;
}
