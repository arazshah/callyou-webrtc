DO $$ BEGIN CREATE TYPE "room_status" AS ENUM ('active', 'ended', 'expired'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "room_role" AS ENUM ('host', 'guest'); EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE TABLE IF NOT EXISTS "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "slug" text NOT NULL, "name" text NOT NULL,
  "status" room_status NOT NULL DEFAULT 'active', "board_state" bytea,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "last_activity_at" timestamptz NOT NULL DEFAULT now(), "expires_at" timestamptz NOT NULL, "ended_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_slug_unique" ON "rooms" ("slug");
CREATE INDEX IF NOT EXISTS "rooms_expiry_idx" ON "rooms" ("status", "expires_at");
CREATE TABLE IF NOT EXISTS "room_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "participant_id" uuid NOT NULL DEFAULT gen_random_uuid(), "display_name" text NOT NULL, "role" room_role NOT NULL,
  "color" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "expires_at" timestamptz NOT NULL,
  "active_until" timestamptz NOT NULL, "revoked_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "room_participant_unique" ON "room_sessions" ("room_id", "participant_id");
CREATE INDEX IF NOT EXISTS "sessions_room_active_idx" ON "room_sessions" ("room_id", "expires_at");
