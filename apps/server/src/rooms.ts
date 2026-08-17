import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';
import { generateSlug, participantColor } from './security.js';
import { canAdmitParticipant } from './capacity.js';

export interface AuthenticatedSession {
  sessionId: string;
  participantId: string;
  roomId: string;
  slug: string;
  displayName: string;
  role: 'host' | 'guest';
  color: string;
  expiresAt: Date;
}
type RoomRow = {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'ended' | 'expired';
  expires_at: Date;
};

export class RoomError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode = 400,
  ) {
    super(code);
  }
}

export class RoomService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly config: Config,
  ) {}
  private sessionExpiry() {
    return new Date(Date.now() + this.config.SESSION_HOURS * 3_600_000);
  }
  private activeExpiry() {
    return new Date(Date.now() + this.config.RECONNECT_GRACE_SECONDS * 1000);
  }

  async create(input: { displayName: string }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = generateSlug();
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const room = await client.query<{ id: string }>(
          `INSERT INTO rooms (slug,name,expires_at) VALUES ($1,$1,now()+($2 * interval '1 hour')) RETURNING id`,
          [slug, this.config.ROOM_INACTIVITY_HOURS],
        );
        const roomId = room.rows[0]!.id;
        const participantId = randomUUID();
        const sessionId = randomUUID();
        await client.query(
          `INSERT INTO room_sessions (id,room_id,participant_id,display_name,role,color,expires_at,active_until) VALUES ($1,$2,$3,$4,'host',$5,$6,$7)`,
          [
            sessionId,
            roomId,
            participantId,
            input.displayName,
            participantColor(participantId),
            this.sessionExpiry(),
            this.activeExpiry(),
          ],
        );
        await client.query('COMMIT');
        return { slug, sessionId };
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505') {
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
    throw new RoomError('slug_generation_failed', 503);
  }

  async join(slug: string, displayName: string, existingSessionId: string | null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<RoomRow>(
        'SELECT id,slug,name,status,expires_at FROM rooms WHERE slug=$1 FOR UPDATE',
        [slug],
      );
      const room = result.rows[0];
      if (!room || room.status !== 'active' || room.expires_at <= new Date())
        throw new RoomError('room_unavailable', 404);
      if (existingSessionId) {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM room_sessions WHERE id=$1 AND room_id=$2 AND revoked_at IS NULL AND expires_at>now()`,
          [existingSessionId, room.id],
        );
        if (existing.rowCount) {
          await client.query(`UPDATE room_sessions SET active_until=$1 WHERE id=$2`, [
            this.activeExpiry(),
            existingSessionId,
          ]);
          await client.query('COMMIT');
          return { sessionId: existingSessionId };
        }
      }
      const active = await client.query(
        `SELECT id FROM room_sessions WHERE room_id=$1 AND revoked_at IS NULL AND active_until>now()`,
        [room.id],
      );
      if (!canAdmitParticipant(active.rowCount ?? 0, false)) throw new RoomError('room_full', 409);
      const participantId = randomUUID();
      const sessionId = randomUUID();
      await client.query(
        `INSERT INTO room_sessions (id,room_id,participant_id,display_name,role,color,expires_at,active_until) VALUES ($1,$2,$3,$4,'guest',$5,$6,$7)`,
        [
          sessionId,
          room.id,
          participantId,
          displayName,
          participantColor(participantId),
          this.sessionExpiry(),
          this.activeExpiry(),
        ],
      );
      await client.query(
        `UPDATE rooms SET last_activity_at=now(),expires_at=now()+($2 * interval '1 hour') WHERE id=$1`,
        [room.id, this.config.ROOM_INACTIVITY_HOURS],
      );
      await client.query('COMMIT');
      return { sessionId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(
    sessionId: string | null,
    slug?: string,
  ): Promise<AuthenticatedSession | null> {
    if (!sessionId) return null;
    const result = await this.pool.query<
      AuthenticatedSession & { status: string; expires_at: Date }
    >(
      `SELECT s.id AS "sessionId",s.participant_id AS "participantId",s.room_id AS "roomId",r.slug,s.display_name AS "displayName",s.role,s.color,s.expires_at AS "expiresAt",r.status FROM room_sessions s JOIN rooms r ON r.id=s.room_id WHERE s.id=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [sessionId],
    );
    const session = result.rows[0];
    return session && session.status === 'active' && (!slug || session.slug === slug)
      ? session
      : null;
  }
  async touch(sessionId: string) {
    await this.pool.query(
      `UPDATE room_sessions SET active_until=now()+($2 * interval '1 second') WHERE id=$1 AND revoked_at IS NULL`,
      [sessionId, this.config.RECONNECT_GRACE_SECONDS],
    );
  }
  async leave(sessionId: string) {
    await this.pool.query(
      'UPDATE room_sessions SET active_until=now(),revoked_at=now() WHERE id=$1',
      [sessionId],
    );
  }
  async end(roomId: string, sessionId: string) {
    const result = await this.pool.query(
      `UPDATE rooms SET status='ended',ended_at=now(),updated_at=now() WHERE id=$1 AND EXISTS (SELECT 1 FROM room_sessions WHERE id=$2 AND room_id=$1 AND role='host' AND revoked_at IS NULL) RETURNING id`,
      [roomId, sessionId],
    );
    if (!result.rowCount) throw new RoomError('forbidden', 403);
    await this.pool.query(
      'UPDATE room_sessions SET revoked_at=now(),active_until=now() WHERE room_id=$1',
      [roomId],
    );
  }
  async expireInactive() {
    await this.pool.query(
      `WITH expired AS (UPDATE rooms SET status='expired',board_state=NULL,updated_at=now() WHERE status='active' AND expires_at<now() AND NOT EXISTS (SELECT 1 FROM room_sessions WHERE room_id=rooms.id AND active_until>now()) RETURNING id) DELETE FROM room_sessions WHERE room_id IN (SELECT id FROM expired)`,
    );
  }
}
