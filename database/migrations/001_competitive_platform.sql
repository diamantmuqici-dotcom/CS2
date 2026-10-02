-- CSGO platform migration 001. Additive and safe to run more than once.
BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('User', 'Creator', 'Moderator', 'Admin', 'Superadmin'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS immutable_player_id VARCHAR(24);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio VARCHAR(280) NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banner_art VARCHAR(128) NOT NULL DEFAULT 'industrial-dawn';
UPDATE profiles SET immutable_player_id = 'CSGO-' || upper(substr(replace(user_id::text, '-', ''), 1, 12)) WHERE immutable_player_id IS NULL;
ALTER TABLE profiles ALTER COLUMN immutable_player_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_immutable_player_id ON profiles(immutable_player_id);

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(32) NOT NULL,
  region VARCHAR(16) NOT NULL,
  party_size INTEGER NOT NULL CHECK (party_size > 0),
  rating INTEGER NOT NULL DEFAULT 1000,
  state VARCHAR(16) NOT NULL DEFAULT 'SEARCHING' CHECK (state IN ('SEARCHING', 'ALLOCATED', 'CANCELLED', 'EXPIRED')),
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_state_region ON matchmaking_queue(state, region, queued_at);
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_rating ON matchmaking_queue(mode, rating);

CREATE TABLE IF NOT EXISTS anti_cheat_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id VARCHAR(32) NOT NULL UNIQUE,
  player_id UUID REFERENCES users(id) ON DELETE SET NULL,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  map_id VARCHAR(64) NOT NULL,
  mode VARCHAR(32) NOT NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_category VARCHAR(16) NOT NULL CHECK (risk_category IN ('NORMAL', 'MONITOR', 'SUSPICIOUS', 'HIGH_RISK', 'QUARANTINE')),
  replay_reference UUID REFERENCES replays(id) ON DELETE SET NULL,
  decision VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  appeal_state VARCHAR(24) NOT NULL DEFAULT 'NOT_FILED',
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_cases_player ON anti_cheat_cases(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_cases_match ON anti_cheat_cases(match_id);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_cases_state ON anti_cheat_cases(decision, risk_category);

CREATE TABLE IF NOT EXISTS anti_cheat_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES anti_cheat_cases(id) ON DELETE CASCADE,
  event_code VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  detail TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_anti_cheat_events_case ON anti_cheat_events(case_id, occurred_at);

CREATE TABLE IF NOT EXISTS anti_cheat_features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES anti_cheat_cases(id) ON DELETE CASCADE,
  feature_name VARCHAR(64) NOT NULL,
  feature_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anti_cheat_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES anti_cheat_cases(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision VARCHAR(24) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appeals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES anti_cheat_cases(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'APPROVED', 'DENIED')),
  response TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status, created_at);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(16) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(96) NOT NULL,
  result VARCHAR(16) NOT NULL,
  correlation_id VARCHAR(64) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_logs(target_type, target_id);

COMMIT;
