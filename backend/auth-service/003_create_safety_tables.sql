-- Migration: Create safety and moderation tables
-- Description: Add blocks and reports tables for user safety features
-- Date: 2025-11-05

-- Create blocks table
CREATE TABLE IF NOT EXISTS blocks (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    blocked_user_id VARCHAR(255) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, blocked_user_id)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_blocks_user_id ON blocks(user_id);

-- Create index on blocked_user_id for bidirectional checks
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_user_id ON blocks(blocked_user_id);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(255) PRIMARY KEY,
    reporter_id VARCHAR(255) NOT NULL,
    reported_user_id VARCHAR(255) NOT NULL,
    reason VARCHAR(100) NOT NULL,
    details TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT
);

-- Create index on reported_user_id for moderation
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON reports(reported_user_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Create index on reporter_id
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);

-- Add comments
COMMENT ON TABLE blocks IS 'Stores user blocks for safety';
COMMENT ON TABLE reports IS 'Stores user reports for moderation';
COMMENT ON COLUMN blocks.user_id IS 'ID of user who blocked';
COMMENT ON COLUMN blocks.blocked_user_id IS 'ID of user who was blocked';
COMMENT ON COLUMN reports.status IS 'Status: pending, reviewed, resolved, dismissed';
