-- Migration: Add Golden Ticket tables for referral system
-- Description: Invite codes and ticket ledger for growth features
-- Date: 2025-12-06

-- Invite codes (Golden Tickets)
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) UNIQUE NOT NULL,           -- e.g., "VLVT-A7X9"
  owner_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_by_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE        -- NULL = never expires
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_owner ON invite_codes(owner_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by ON invite_codes(used_by_id);

-- Ticket ledger (earning/spending history)
CREATE TABLE IF NOT EXISTS ticket_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INT NOT NULL,                        -- +1 or -1
  reason VARCHAR(50) NOT NULL,                -- 'verification', 'first_match', 'date_completed', 'invite_created', 'referral_bonus', 'signup_bonus'
  reference_id VARCHAR(255),                  -- ID of related record (verification, match, date, invite)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_ledger_user ON ticket_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_ledger_reason ON ticket_ledger(reason);

-- Add referred_by column to users table to track who invited whom
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- Comments
COMMENT ON TABLE invite_codes IS 'Golden Ticket invite codes for referral system';
COMMENT ON COLUMN invite_codes.code IS 'Unique invite code like VLVT-A7X9';
COMMENT ON COLUMN invite_codes.owner_id IS 'User who created/owns this invite code';
COMMENT ON COLUMN invite_codes.used_by_id IS 'User who redeemed this invite code';
COMMENT ON COLUMN invite_codes.expires_at IS 'Optional expiration date, NULL means never expires';

COMMENT ON TABLE ticket_ledger IS 'Transaction history for Golden Tickets';
COMMENT ON COLUMN ticket_ledger.amount IS 'Positive for earning, negative for spending';
COMMENT ON COLUMN ticket_ledger.reason IS 'Why ticket was earned/spent: verification, first_match, date_completed, invite_created, referral_bonus, signup_bonus';
COMMENT ON COLUMN ticket_ledger.reference_id IS 'Related entity ID for audit trail';

COMMENT ON COLUMN users.referred_by IS 'User ID of who referred this user (for bonus tracking)';
