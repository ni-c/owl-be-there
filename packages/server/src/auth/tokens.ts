import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * The organiser's key: 256 random bits, carried in the URL fragment and
 * stored only as a hash. A plain SHA-256 is enough — a slow hash protects
 * passwords people chose, and nobody chose this one.
 */
export function newAdminToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashAdminToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAdminToken(
  token: string | undefined,
  hash: string
): boolean {
  if (!token || token.length > 128) return false;
  const given = Buffer.from(hashAdminToken(token), 'hex');
  const stored = Buffer.from(hash, 'hex');
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/**
 * A participant's key: `<participant>.<generation>.<signature>`.
 *
 * Nothing is stored per session. The signature binds the token to the event,
 * the participant and a generation counter; raising the counter — when a
 * password is set, changed or removed — revokes every token issued before,
 * including one somebody took before the owner protected the name. Every
 * device that enters the name gets the same token, so signing in on a phone
 * never signs out the laptop.
 */
export function signParticipantToken(
  secret: Buffer,
  eventId: string,
  participantId: string,
  generation: number
): string {
  return `${participantId}.${generation}.${signature(secret, eventId, participantId, generation)}`;
}

export interface ParticipantClaim {
  participantId: string;
  generation: number;
}

/** The participant a token speaks for, if its signature holds for this event. */
export function readParticipantToken(
  secret: Buffer,
  eventId: string,
  token: string | undefined
): ParticipantClaim | null {
  if (!token || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [participantId, generationText, given] = parts as [
    string,
    string,
    string,
  ];
  if (!/^\d{1,9}$/.test(generationText)) return null;
  const generation = Number(generationText);
  const expected = Buffer.from(
    signature(secret, eventId, participantId, generation)
  );
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return { participantId, generation };
}

function signature(
  secret: Buffer,
  eventId: string,
  participantId: string,
  generation: number
): string {
  return createHmac('sha256', secret)
    .update(`${eventId}|${participantId}|${generation}`)
    .digest('base64url');
}
