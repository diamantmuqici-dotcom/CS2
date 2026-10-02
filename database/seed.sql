-- ============================================================================
-- VANGUARD PROTOCOL — Initial Seed Data
-- ============================================================================

INSERT INTO users (id, username, email, password_hash, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Operative_Zero', 'zero@vanguard.gg', '$2b$12$authoritativeHashZero', 'Admin'),
  ('22222222-2222-2222-2222-222222222222', 'Kestrel_VFX', 'kestrel@vanguard.gg', '$2b$12$authoritativeHashKestrel', 'Creator'),
  ('33333333-3333-3333-3333-333333333333', 'Valkyrie_99', 'valkyrie@vanguard.gg', '$2b$12$authoritativeHashValkyrie', 'Moderator'),
  ('44444444-4444-4444-4444-444444444444', 'Nexus_Aim', 'nexus@vanguard.gg', '$2b$12$authoritativeHashNexus', 'User')
ON CONFLICT (username) DO NOTHING;

INSERT INTO profiles (user_id, display_name, avatar_id, title, level, xp, competitive_rank, premier_rating, favorite_map, playtime_seconds)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Operative_Zero', 'sentinel-alpha', 'Vanguard Commander', 42, 184500, 'Apex Sovereign', 21450, 'harbor_protocol', 312400),
  ('22222222-2222-2222-2222-222222222222', 'Kestrel_VFX', 'vortex-architect', 'Master Map Architect', 35, 142000, 'Diamond Vanguard I', 18920, 'citadel_spire', 219000),
  ('33333333-3333-3333-3333-333333333333', 'Valkyrie_99', 'sentinel-recon', 'Overwatch Enforcer', 39, 161000, 'Obsidian Elite', 20110, 'harbor_protocol', 274000),
  ('44444444-4444-4444-4444-444444444444', 'Nexus_Aim', 'vortex-striker', 'Precision Specialist', 28, 98000, 'Platinum Striker III', 16400, 'foundry_wing', 154000)
ON CONFLICT (user_id) DO NOTHING;
