-- Migration: Add verification system
-- Date: 2025-12-06
-- Description: Adds selfie verification support with AWS Rekognition

-- Add verification columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

-- Create verifications table for verification attempts
CREATE TABLE IF NOT EXISTS verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Verification attempt data
    selfie_key VARCHAR(255) NOT NULL,           -- R2 key for verification selfie
    reference_photo_key VARCHAR(255),            -- Profile photo used for comparison
    gesture_prompt VARCHAR(50) NOT NULL,         -- What gesture was requested

    -- Rekognition results
    similarity_score DECIMAL(5, 2),              -- 0-100 confidence
    rekognition_response JSONB,                  -- Full API response for debugging

    -- Status
    status VARCHAR(20) DEFAULT 'pending',        -- pending, approved, rejected, expired
    rejection_reason TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_verifications_user ON verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON verifications(status);

-- Add comment for documentation
COMMENT ON TABLE verifications IS 'Selfie verification attempts with AWS Rekognition face comparison results';
COMMENT ON COLUMN verifications.gesture_prompt IS 'Random gesture the user was asked to perform (e.g., three_fingers, touch_nose, look_left)';
COMMENT ON COLUMN verifications.similarity_score IS 'Rekognition face comparison confidence score (0-100)';
