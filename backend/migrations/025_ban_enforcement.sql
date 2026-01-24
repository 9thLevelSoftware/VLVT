-- Migration 025: Ban Enforcement Infrastructure
-- Purpose: Add device fingerprinting and photo perceptual hashing for ban evasion detection
--
-- Tables:
-- - device_fingerprints: Collected at session start for device tracking
-- - banned_photo_hashes: Perceptual hashes of photos from banned users
--
-- Columns:
-- - after_hours_profiles.photo_hash: Hash of current profile photo

-- Device fingerprints collected at session start
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES after_hours_sessions(id) ON DELETE SET NULL,
  device_id VARCHAR(255),           -- IDFV (iOS) or Android ID
  device_model VARCHAR(100),        -- e.g., "iPhone14,3"
  platform VARCHAR(20),             -- 'ios' or 'android'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_device ON device_fingerprints(device_id);

-- Photo hashes for banned users (perceptual hash)
CREATE TABLE IF NOT EXISTS banned_photo_hashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_hash VARCHAR(16) NOT NULL,  -- 64-bit hex string from sharp-phash
  user_id VARCHAR(255),             -- Optional: user who was banned (for audit)
  reason TEXT,                      -- Why this hash was banned
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banned_photo_hashes_hash ON banned_photo_hashes(photo_hash);

-- After Hours profile photo hashes (for tracking, not enforcement)
ALTER TABLE after_hours_profiles
ADD COLUMN IF NOT EXISTS photo_hash VARCHAR(16);
