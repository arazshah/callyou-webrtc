import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export function createSessionToken(sessionId: string, secret: string): string {
  const nonce = randomBytes(12).toString('base64url');
  const body = `${sessionId}.${nonce}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifySessionToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const [sessionId, nonce, signature, extra] = token.split('.');
  if (!sessionId || !nonce || !signature || extra) return null;
  const body = `${sessionId}.${nonce}`;
  const expected = createHmac('sha256', secret).update(body).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? sessionId : null;
}
export function generateSlug(): string {
  const adjectives = ['calm', 'bright', 'kind', 'swift', 'clear', 'blue', 'warm', 'quiet'];
  const nouns = ['cedar', 'river', 'falcon', 'canvas', 'cloud', 'maple', 'orbit', 'meadow'];
  const bytes = randomBytes(4);
  return `${adjectives[bytes[0]! % adjectives.length]}-${nouns[bytes[1]! % nouns.length]}-${bytes.readUInt16BE(2).toString(36)}`;
}
export function participantColor(participantId: string): string {
  const colors = ['#2563eb', '#db2777', '#059669', '#7c3aed', '#ea580c'];
  return colors[participantId.charCodeAt(0) % colors.length]!;
}
