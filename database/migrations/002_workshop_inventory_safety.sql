-- CSGO platform migration 002. Workshop and inventory hardening.
BEGIN;
ALTER TABLE workshop_maps ADD COLUMN IF NOT EXISTS moderation_state VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE workshop_maps ADD COLUMN IF NOT EXISTS package_sha256 VARCHAR(64);
ALTER TABLE workshop_maps ADD COLUMN IF NOT EXISTS report_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workshop_versions ADD COLUMN IF NOT EXISTS validation_report JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS inspect_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_workshop_moderation ON workshop_maps(moderation_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_favorite ON inventory(user_id, favorite);
COMMIT;
