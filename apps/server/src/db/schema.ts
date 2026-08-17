import {
  customType,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const roomStatus = pgEnum('room_status', ['active', 'ended', 'expired']);
export const roomRole = pgEnum('room_role', ['host', 'guest']);
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: roomStatus('status').notNull().default('active'),
    boardState: bytea('board_state'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('rooms_slug_unique').on(table.slug),
    index('rooms_expiry_idx').on(table.status, table.expiresAt),
  ],
);

export const roomSessions = pgTable(
  'room_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id').notNull().defaultRandom(),
    displayName: text('display_name').notNull(),
    role: roomRole('role').notNull(),
    color: text('color').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    activeUntil: timestamp('active_until', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('room_participant_unique').on(table.roomId, table.participantId),
    index('sessions_room_active_idx').on(table.roomId, table.expiresAt),
  ],
);
