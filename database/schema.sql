-- ============================================================================
-- VANGUARD PROTOCOL — PostgreSQL Authoritative Database Schema
-- Version: 1.0.0
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS & ROLES (User, Creator, Moderator, Admin)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'User' CHECK (role IN ('User', 'Creator', 'Moderator', 'Admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- 2. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(48) NOT NULL,
  avatar_id VARCHAR(64) NOT NULL DEFAULT 'sentinel-alpha',
  banner_id VARCHAR(64) NOT NULL DEFAULT 'tac-grid',
  title VARCHAR(64) NOT NULL DEFAULT 'Tactical Operative',
  level INTEGER NOT NULL DEFAULT 1,
  xp BIGINT NOT NULL DEFAULT 0,
  competitive_rank VARCHAR(32) NOT NULL DEFAULT 'Gold Vanguard II',
  premier_rating INTEGER NOT NULL DEFAULT 14250,
  favorite_map VARCHAR(64) NOT NULL DEFAULT 'harbor_protocol',
  playtime_seconds BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_premier_rating ON profiles(premier_rating DESC);
CREATE INDEX idx_profiles_competitive_rank ON profiles(competitive_rank);

-- 3. PLAYER SETTINGS (Versioned JSONB schemas)
CREATE TABLE IF NOT EXISTS settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  video_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  controls_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  audio_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  crosshair_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  gameplay_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  network_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. RATINGS (Mode-specific MMR & Premier history)
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(32) NOT NULL,
  mmr INTEGER NOT NULL DEFAULT 1000,
  premier_csr INTEGER NOT NULL DEFAULT 10000,
  rank_tier VARCHAR(32) NOT NULL DEFAULT 'Silver Operative I',
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, mode)
);

CREATE INDEX idx_ratings_mode_csr ON ratings(mode, premier_csr DESC);
CREATE INDEX idx_ratings_user_mode ON ratings(user_id, mode);

-- 5. STATISTICS (Career & per-weapon aggregates)
CREATE TABLE IF NOT EXISTS statistics (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  matches_played INTEGER NOT NULL DEFAULT 0,
  matches_won INTEGER NOT NULL DEFAULT 0,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  rounds_won INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  headshots INTEGER NOT NULL DEFAULT 0,
  total_damage BIGINT NOT NULL DEFAULT 0,
  utility_damage BIGINT NOT NULL DEFAULT 0,
  entry_kills INTEGER NOT NULL DEFAULT 0,
  clutches_won INTEGER NOT NULL DEFAULT 0,
  mvps INTEGER NOT NULL DEFAULT 0,
  shots_fired BIGINT NOT NULL DEFAULT 0,
  shots_hit BIGINT NOT NULL DEFAULT 0,
  weapon_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. MATCHES
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mode VARCHAR(32) NOT NULL,
  map_id VARCHAR(64) NOT NULL,
  region VARCHAR(16) NOT NULL,
  server_tick_rate INTEGER NOT NULL DEFAULT 64,
  sentinel_score INTEGER NOT NULL DEFAULT 0,
  vortex_score INTEGER NOT NULL DEFAULT 0,
  winner_team VARCHAR(16) NOT NULL CHECK (winner_team IN ('SENTINEL', 'VORTEX', 'DRAW')),
  total_rounds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_matches_mode_ended ON matches(mode, ended_at DESC);
CREATE INDEX idx_matches_map_id ON matches(map_id);

-- 7. MATCH PLAYERS
CREATE TABLE IF NOT EXISTS match_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  player_name VARCHAR(48) NOT NULL,
  team VARCHAR(16) NOT NULL CHECK (team IN ('SENTINEL', 'VORTEX')),
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  headshots INTEGER NOT NULL DEFAULT 0,
  adr NUMERIC(6,2) NOT NULL DEFAULT 0,
  hs_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  utility_damage INTEGER NOT NULL DEFAULT 0,
  entry_kills INTEGER NOT NULL DEFAULT 0,
  clutches INTEGER NOT NULL DEFAULT 0,
  mvps INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  rating_delta INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_match_players_match ON match_players(match_id);
CREATE INDEX idx_match_players_user ON match_players(user_id);

-- 8. INVENTORY & WEAPON COLLECTION
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(64) NOT NULL,
  weapon_id VARCHAR(64) NOT NULL,
  skin_name VARCHAR(96) NOT NULL,
  rarity VARCHAR(24) NOT NULL CHECK (rarity IN ('Standard', 'Tactical', 'SpecOps', 'Classified', 'Prototype', 'Apex')),
  wear_float NUMERIC(7,6) NOT NULL DEFAULT 0.035000,
  stat_tracker_kills INTEGER DEFAULT 0,
  equipped_sentinel BOOLEAN NOT NULL DEFAULT FALSE,
  equipped_vortex BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_user ON inventory(user_id);

-- 9. WORKSHOP MAPS
CREATE TABLE IF NOT EXISTS workshop_maps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(96) NOT NULL UNIQUE,
  title VARCHAR(96) NOT NULL,
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  creator_name VARCHAR(48) NOT NULL,
  description TEXT NOT NULL,
  current_version VARCHAR(24) NOT NULL DEFAULT '1.0.0',
  supported_modes TEXT[] NOT NULL DEFAULT ARRAY['Competitive', 'Deathmatch', 'Practice'],
  thumbnail_theme VARCHAR(48) NOT NULL DEFAULT 'industrial',
  downloads INTEGER NOT NULL DEFAULT 0,
  subscriptions INTEGER NOT NULL DEFAULT 0,
  plays INTEGER NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 4.80,
  rating_count INTEGER NOT NULL DEFAULT 1,
  is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  map_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workshop_maps_downloads ON workshop_maps(downloads DESC);
CREATE INDEX idx_workshop_maps_rating ON workshop_maps(rating_avg DESC);
CREATE INDEX idx_workshop_maps_created ON workshop_maps(created_at DESC);

-- 10. WORKSHOP VERSIONS
CREATE TABLE IF NOT EXISTS workshop_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES workshop_maps(id) ON DELETE CASCADE,
  version VARCHAR(24) NOT NULL,
  changelog TEXT NOT NULL,
  package_size_bytes INTEGER NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workshop_versions_map ON workshop_versions(map_id, created_at DESC);

-- 11. WORKSHOP RATINGS
CREATE TABLE IF NOT EXISTS workshop_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  map_id UUID NOT NULL REFERENCES workshop_maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_subscribed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(map_id, user_id)
);

CREATE INDEX idx_workshop_ratings_map ON workshop_ratings(map_id);

-- 12. FRIENDS
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX idx_friends_user ON friends(user_id, status);

-- 13. PARTIES
CREATE TABLE IF NOT EXISTS parties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region VARCHAR(16) NOT NULL DEFAULT 'EU',
  selected_mode VARCHAR(32) NOT NULL DEFAULT 'Competitive',
  queue_state VARCHAR(16) NOT NULL DEFAULT 'idle',
  members JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. REPORTS
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(16) NOT NULL CHECK (target_type IN ('player', 'workshop_map')),
  target_id VARCHAR(96) NOT NULL,
  reason VARCHAR(64) NOT NULL,
  details TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON reports(status, created_at DESC);

-- 15. BANS & ANTI-CHEAT ACTIONS
CREATE TABLE IF NOT EXISTS bans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by VARCHAR(64) NOT NULL DEFAULT 'VANGUARD_ANTICHEAT',
  reason VARCHAR(128) NOT NULL,
  telemetry_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bans_user ON bans(user_id);

-- 16. REPLAYS (Compact Tick-Event Stream Storage)
CREATE TABLE IF NOT EXISTS replays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  title VARCHAR(128) NOT NULL,
  map_id VARCHAR(64) NOT NULL,
  mode VARCHAR(32) NOT NULL,
  tick_rate INTEGER NOT NULL DEFAULT 64,
  duration_seconds NUMERIC(8,2) NOT NULL,
  round_count INTEGER NOT NULL DEFAULT 1,
  event_stream JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_replays_match ON replays(match_id);
CREATE INDEX idx_replays_created ON replays(created_at DESC);
