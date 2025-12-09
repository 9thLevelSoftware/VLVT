-- Migration: Add KYCAID ID verification system
-- Date: 2025-12-09
-- Description: Adds government ID verification via KYCAID (replaces selfie-only verification)

-- Add KYCAID-specific columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kycaid_applicant_id VARCHAR(255);

-- Create kycaid_verifications table for verification attempts
CREATE TABLE IF NOT EXISTS kycaid_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- KYCAID identifiers
    kycaid_applicant_id VARCHAR(255),       -- KYCAID applicant ID
    kycaid_verification_id VARCHAR(255),     -- KYCAID verification ID
    kycaid_form_id VARCHAR(255),             -- Form ID used for verification

    -- Verification result
    status VARCHAR(50) DEFAULT 'pending',    -- pending, completed, approved, declined, failed
    verification_status VARCHAR(50),         -- KYCAID status: pending, approved, declined

    -- Extracted data (from ID document)
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    date_of_birth DATE,
    document_type VARCHAR(50),               -- passport, drivers_license, id_card
    document_number VARCHAR(255),
    document_country VARCHAR(10),
    document_expiry DATE,

    -- Verification checks performed
    document_verified BOOLEAN DEFAULT FALSE,
    face_match_verified BOOLEAN DEFAULT FALSE,
    liveness_verified BOOLEAN DEFAULT FALSE,
    aml_cleared BOOLEAN DEFAULT FALSE,

    -- Full KYCAID response for debugging
    kycaid_response JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT unique_kycaid_verification UNIQUE (kycaid_verification_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_kycaid_verifications_user ON kycaid_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kycaid_verifications_status ON kycaid_verifications(status);
CREATE INDEX IF NOT EXISTS idx_kycaid_verifications_applicant ON kycaid_verifications(kycaid_applicant_id);

-- Add comments for documentation
COMMENT ON TABLE kycaid_verifications IS 'KYCAID ID verification attempts and results';
COMMENT ON COLUMN kycaid_verifications.status IS 'Internal status: pending (waiting), completed (got result), approved (passed), declined (failed), failed (error)';
COMMENT ON COLUMN users.id_verified IS 'True if user has completed government ID verification via KYCAID';
