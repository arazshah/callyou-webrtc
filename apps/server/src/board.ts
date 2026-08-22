import type pg from 'pg';
import * as Y from 'yjs';
import { boardElementSchema, boardPageSchema, LIMITS } from '@callyou/shared';

interface ManagedDoc {
  doc: Y.Doc;
  timer: NodeJS.Timeout | undefined;
}
export class BoardManager {
  private readonly docs = new Map<string, ManagedDoc>();
  constructor(private readonly pool: pg.Pool) {}
  async get(roomId: string): Promise<Y.Doc> {
    const cached = this.docs.get(roomId);
    if (cached) return cached.doc;
    const doc = new Y.Doc();
    const result = await this.pool.query<{ board_state: Buffer | null }>(
      'SELECT board_state FROM rooms WHERE id=$1',
      [roomId],
    );
    const snapshot = result.rows[0]?.board_state;
    if (snapshot) Y.applyUpdate(doc, snapshot);
    this.docs.set(roomId, { doc, timer: undefined });
    return doc;
  }
  async apply(roomId: string, update: Uint8Array): Promise<boolean> {
    if (update.byteLength > LIMITS.yjsUpdateBytes) return false;
    const doc = await this.get(roomId);
    const candidate = new Y.Doc();
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
    try {
      Y.applyUpdate(candidate, update);
    } catch {
      return false;
    }
    const values = [...candidate.getMap('elements').values()];
    const pages = [...candidate.getMap('pages').values()];
    if (
      values.length > LIMITS.boardElements ||
      pages.length > LIMITS.boardPages ||
      values.filter((value) => (value as { type?: unknown }).type === 'image').length >
        LIMITS.boardAssets ||
      values.some((value) => !boardElementSchema.safeParse(value).success) ||
      pages.some((value) => !boardPageSchema.safeParse(value).success)
    )
      return false;
    Y.applyUpdate(doc, update);
    this.schedule(roomId);
    return true;
  }
  async clear(roomId: string) {
    const doc = await this.get(roomId);
    doc.transact(() => doc.getMap('elements').clear(), 'server-clear');
    await this.flush(roomId);
  }
  private schedule(roomId: string) {
    const managed = this.docs.get(roomId)!;
    if (managed.timer) clearTimeout(managed.timer);
    managed.timer = setTimeout(() => void this.flush(roomId), 750);
  }
  async flush(roomId: string) {
    const managed = this.docs.get(roomId);
    if (!managed) return;
    if (managed.timer) clearTimeout(managed.timer);
    managed.timer = undefined;
    const state = Y.encodeStateAsUpdate(managed.doc);
    await this.pool.query(
      'UPDATE rooms SET board_state=$1,updated_at=now(),last_activity_at=now() WHERE id=$2',
      [Buffer.from(state), roomId],
    );
  }
  async flushAll() {
    await Promise.all([...this.docs.keys()].map((id) => this.flush(id)));
  }
  remove(roomId: string) {
    this.docs.delete(roomId);
  }
}
