-- Migration 016: Add Login Attempts Tracking and Account Lockout
-- Security feature to prevent brute force password attacks
-- Locks account for 15 minutes after 5 failed login attempts

-- Add failed login attempt tracking columns to auth_credentials
ALTER TABLE auth_credentials
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

-- Create login_attempts table for detailed audit logging
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address VARCHAR(45), -- IPv6 addresses can be up to 45 chars
  user_agent TEXT,
  failure_reason VARCHAR(100), -- 'invalid_password', 'account_locked', 'email_not_verified', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON login_attempts(ip_address);

-- Index on auth_credentials for locked accounts lookup
CREATE INDEX IF NOT EXISTS idx_auth_credentials_locked_until
  ON auth_credentials(locked_until)
  WHERE locked_until IS NOT NULL;

-- Database function to check if account is locked
-- Returns TRUE if account is currently locked, FALSE otherwise
CREATE OR REPLACE FUNCTION is_account_locked(p_email VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
  v_locked_until TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT locked_until INTO v_locked_until
  FROM auth_credentials
  WHERE email = LOWER(p_email) AND provider = 'email';

  IF v_locked_until IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if lock has expired
  IF v_locked_until <= NOW() THEN
    -- Lock has expired, clear it
    UPDATE auth_credentials
    SET locked_until = NULL, failed_attempts = 0
    WHERE email = LOWER(p_email) AND provider = 'email';
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Database function to record a failed login attempt
-- Increments failed_attempts and locks account after 5 failures
CREATE OR REPLACE FUNCTION record_failed_login(
  p_email VARCHAR,
  p_ip_address VARCHAR,
  p_user_agent TEXT,
  p_failure_reason VARCHAR DEFAULT 'invalid_password'
)
RETURNS TABLE(
  is_locked BOOLEAN,
  locked_until_ts TIMESTAMP WITH TIME ZONE,
  failed_attempt_count INTEGER
) AS $$
DECLARE
  v_user_id VARCHAR(255);
  v_failed_attempts INTEGER;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_max_attempts INTEGER := 5;
  v_lockout_duration INTERVAL := '15 minutes';
BEGIN
  -- Get user info
  SELECT ac.user_id, ac.failed_attempts INTO v_user_id, v_failed_attempts
  FROM auth_credentials ac
  WHERE ac.email = LOWER(p_email) AND ac.provider = 'email';

  -- Increment failed attempts
  v_failed_attempts := COALESCE(v_failed_attempts, 0) + 1;

  -- Check if we should lock the account
  IF v_failed_attempts >= v_max_attempts THEN
    v_locked_until := NOW() + v_lockout_duration;
  ELSE
    v_locked_until := NULL;
  END IF;

  -- Update auth_credentials
  UPDATE auth_credentials
  SET failed_attempts = v_failed_attempts,
      locked_until = v_locked_until,
      updated_at = NOW()
  WHERE email = LOWER(p_email) AND provider = 'email';

  -- Log the attempt
  INSERT INTO login_attempts (user_id, email, success, ip_address, user_agent, failure_reason)
  VALUES (v_user_id, LOWER(p_email), FALSE, p_ip_address, p_user_agent, p_failure_reason);

  RETURN QUERY SELECT
    v_locked_until IS NOT NULL,
    v_locked_until,
    v_failed_attempts;
END;
$$ LANGUAGE plpgsql;

-- Database function to record a successful login
-- Resets failed_attempts counter and clears any lock
CREATE OR REPLACE FUNCTION record_successful_login(
  p_user_id VARCHAR,
  p_email VARCHAR,
  p_ip_address VARCHAR,
  p_user_agent TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Reset failed attempts and clear lock
  UPDATE auth_credentials
  SET failed_attempts = 0,
      locked_until = NULL,
      updated_at = NOW()
  WHERE email = LOWER(p_email) AND provider = 'email';

  -- Log the successful attempt
  INSERT INTO login_attempts (user_id, email, success, ip_address, user_agent)
  VALUES (p_user_id, LOWER(p_email), TRUE, p_ip_address, p_user_agent);
END;
$$ LANGUAGE plpgsql;

-- Table comments
COMMENT ON TABLE login_attempts IS 'Audit log of all login attempts for security monitoring and compliance';
COMMENT ON COLUMN login_attempts.success IS 'Whether the login attempt was successful';
COMMENT ON COLUMN login_attempts.failure_reason IS 'Reason for login failure if success=false';

-- Column comments for auth_credentials additions
COMMENT ON COLUMN auth_credentials.failed_attempts IS 'Number of consecutive failed login attempts';
COMMENT ON COLUMN auth_credentials.locked_until IS 'Account is locked until this timestamp after too many failed attempts';

-- Function comments
COMMENT ON FUNCTION is_account_locked(VARCHAR) IS 'Check if an account is currently locked due to failed login attempts';
COMMENT ON FUNCTION record_failed_login(VARCHAR, VARCHAR, TEXT, VARCHAR) IS 'Record a failed login attempt and potentially lock the account';
COMMENT ON FUNCTION record_successful_login(VARCHAR, VARCHAR, VARCHAR, TEXT) IS 'Record a successful login and reset failed attempt counter';
