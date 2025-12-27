-- Migration 018: Database-Level Audit Triggers
-- Purpose: Track direct database access for security investigations
-- This complements application-level audit logging (migration 017) by capturing
-- changes made directly to the database, bypassing the application layer.
--
-- Use cases:
-- - Detecting unauthorized direct database access
-- - Security incident investigation
-- - Compliance requirements (audit trail)

-- ============================================================================
-- CONFIGURATION TABLE
-- ============================================================================

-- Table to track which session is coming from the application vs direct DB access
-- Application code should SET this before performing operations
CREATE TABLE IF NOT EXISTS audit_config (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  description TEXT
);

INSERT INTO audit_config (key, value, description) VALUES
  ('app_session_marker', 'VLVT_APP_SESSION', 'Marker used by application to identify itself'),
  ('triggers_enabled', 'true', 'Whether audit triggers are active')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if the current session is from the application
-- Application should call: SET LOCAL vlvt.app_session = 'VLVT_APP_SESSION'
CREATE OR REPLACE FUNCTION is_app_session()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_setting('vlvt.app_session', true) =
         (SELECT value FROM audit_config WHERE key = 'app_session_marker');
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_app_session() IS
  'Returns TRUE if the current session was initiated by the VLVT application';

-- Function to check if triggers are enabled
CREATE OR REPLACE FUNCTION are_audit_triggers_enabled()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT value FROM audit_config WHERE key = 'triggers_enabled') = 'true';
EXCEPTION
  WHEN OTHERS THEN
    RETURN TRUE; -- Default to enabled if config is missing
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to redact sensitive fields from JSONB
-- Removes password hashes, tokens, and other sensitive data before logging
CREATE OR REPLACE FUNCTION redact_sensitive_jsonb(data JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  key TEXT;
  sensitive_fields TEXT[] := ARRAY[
    'password_hash',
    'passwordHash',
    'password',
    'verification_token',
    'verificationToken',
    'reset_token',
    'resetToken',
    'token',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'id_token',
    'idToken',
    'identity_token',
    'identityToken',
    'secret',
    'api_key',
    'apiKey',
    'private_key',
    'privateKey',
    'nonce'
  ];
BEGIN
  IF data IS NULL THEN
    RETURN NULL;
  END IF;

  result := data;

  FOREACH key IN ARRAY sensitive_fields
  LOOP
    IF result ? key THEN
      result := jsonb_set(result, ARRAY[key], '"[REDACTED]"'::jsonb);
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION redact_sensitive_jsonb(JSONB) IS
  'Redacts sensitive fields (passwords, tokens) from JSONB before audit logging';

-- ============================================================================
-- GENERIC AUDIT TRIGGER FUNCTION
-- ============================================================================

-- Main trigger function that handles INSERT, UPDATE, DELETE for any table
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  old_data JSONB;
  new_data JSONB;
  action_name TEXT;
  source_prefix TEXT;
  target_id TEXT;
  actor_id TEXT;
BEGIN
  -- Skip if triggers are disabled
  IF NOT are_audit_triggers_enabled() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Determine source prefix (app vs direct DB access)
  IF is_app_session() THEN
    source_prefix := 'APP_TRIGGER';
  ELSE
    source_prefix := 'DB_TRIGGER';
  END IF;

  -- Build action name: SOURCE:table_name:operation
  action_name := source_prefix || ':' || TG_TABLE_NAME || ':' || TG_OP;

  -- Convert row data to JSONB and redact sensitive fields
  IF TG_OP = 'DELETE' THEN
    old_data := redact_sensitive_jsonb(to_jsonb(OLD));
    new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    old_data := NULL;
    new_data := redact_sensitive_jsonb(to_jsonb(NEW));
  ELSE -- UPDATE
    old_data := redact_sensitive_jsonb(to_jsonb(OLD));
    new_data := redact_sensitive_jsonb(to_jsonb(NEW));
  END IF;

  -- Determine target_id based on table structure
  -- Most tables use 'id' as primary key, some use 'user_id'
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'profiles' THEN
      target_id := OLD.user_id;
    ELSE
      target_id := OLD.id::TEXT;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'profiles' THEN
      target_id := NEW.user_id;
    ELSE
      target_id := NEW.id::TEXT;
    END IF;
  END IF;

  -- Try to determine the actor (user making the change)
  -- For app sessions, this should be set via: SET LOCAL vlvt.actor_id = 'user_id'
  BEGIN
    actor_id := current_setting('vlvt.actor_id', true);
  EXCEPTION
    WHEN OTHERS THEN
      actor_id := NULL;
  END;

  -- Insert audit log entry
  INSERT INTO audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    metadata,
    success
  ) VALUES (
    actor_id,
    action_name,
    TG_TABLE_NAME,
    target_id,
    old_data,
    new_data,
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'trigger_name', TG_NAME,
      'session_user', session_user,
      'current_database', current_database(),
      'is_app_session', is_app_session(),
      'transaction_id', txid_current()
    ),
    TRUE
  );

  -- Return appropriate row for trigger
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION audit_trigger_func() IS
  'Generic audit trigger function that logs all changes to sensitive tables';

-- ============================================================================
-- CREATE AUDIT TRIGGERS FOR SENSITIVE TABLES
-- ============================================================================

-- Users table - track all changes (account creation, email changes, provider changes)
DROP TRIGGER IF EXISTS audit_users_trigger ON users;
CREATE TRIGGER audit_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_func();

-- Profiles table - track profile data modifications
DROP TRIGGER IF EXISTS audit_profiles_trigger ON profiles;
CREATE TRIGGER audit_profiles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_func();

-- Auth credentials table - track password changes, email verification, etc.
-- Note: Password hashes are automatically redacted by redact_sensitive_jsonb()
DROP TRIGGER IF EXISTS audit_auth_credentials_trigger ON auth_credentials;
CREATE TRIGGER audit_auth_credentials_trigger
  AFTER INSERT OR UPDATE OR DELETE ON auth_credentials
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_func();

-- Matches table - track match status changes
DROP TRIGGER IF EXISTS audit_matches_trigger ON matches;
CREATE TRIGGER audit_matches_trigger
  AFTER INSERT OR UPDATE OR DELETE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_func();

-- Messages table - track message modifications (should be rare)
DROP TRIGGER IF EXISTS audit_messages_trigger ON messages;
CREATE TRIGGER audit_messages_trigger
  AFTER INSERT OR UPDATE OR DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_func();

-- Blocks table - track moderation actions
DROP TRIGGER IF EXISTS audit_blocks_trigger ON blocks;
CREATE TRIGGER audit_blocks_trigger
  AFTER INSERT OR UPDATE OR DELETE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_func();

-- Reports table - track report status changes and moderation decisions
DROP TRIGGER IF EXISTS audit_reports_trigger ON reports;
CREATE TRIGGER audit_reports_trigger
  AFTER INSERT OR UPDATE OR DELETE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_func();

-- ============================================================================
-- UTILITY FUNCTIONS FOR MANAGING AUDIT TRIGGERS
-- ============================================================================

-- Function to temporarily disable audit triggers (for bulk operations)
-- Usage: SELECT disable_audit_triggers();
CREATE OR REPLACE FUNCTION disable_audit_triggers()
RETURNS VOID AS $$
BEGIN
  UPDATE audit_config SET value = 'false' WHERE key = 'triggers_enabled';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION disable_audit_triggers() IS
  'Temporarily disable audit triggers (use sparingly, for bulk operations)';

-- Function to re-enable audit triggers
-- Usage: SELECT enable_audit_triggers();
CREATE OR REPLACE FUNCTION enable_audit_triggers()
RETURNS VOID AS $$
BEGIN
  UPDATE audit_config SET value = 'true' WHERE key = 'triggers_enabled';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enable_audit_triggers() IS
  'Re-enable audit triggers after they were disabled';

-- Function to mark the current session as coming from the application
-- Application code should call this at the start of each transaction
-- Usage: SELECT mark_app_session('user_id_here');
CREATE OR REPLACE FUNCTION mark_app_session(actor_user_id TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('vlvt.app_session',
    (SELECT value FROM audit_config WHERE key = 'app_session_marker'),
    true); -- true = LOCAL (transaction-scoped)

  IF actor_user_id IS NOT NULL THEN
    PERFORM set_config('vlvt.actor_id', actor_user_id, true);
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_app_session(TEXT) IS
  'Mark current transaction as originating from VLVT application. Pass user ID if available.';

-- Function to query audit logs with filtering options
-- Useful for security investigations
CREATE OR REPLACE FUNCTION query_db_audit_logs(
  p_table_name TEXT DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_start_time TIMESTAMPTZ DEFAULT NULL,
  p_end_time TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_include_app_sessions BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  action TEXT,
  resource_type TEXT,
  resource_id TEXT,
  user_id TEXT,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  is_direct_db_access BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.id,
    al.created_at,
    al.action::TEXT,
    al.resource_type::TEXT,
    al.resource_id::TEXT,
    al.user_id::TEXT,
    al.old_value,
    al.new_value,
    al.metadata,
    al.action LIKE 'DB_TRIGGER:%' AS is_direct_db_access
  FROM audit_log al
  WHERE
    -- Filter by trigger-generated entries only
    (al.action LIKE 'DB_TRIGGER:%' OR (p_include_app_sessions AND al.action LIKE 'APP_TRIGGER:%'))
    -- Optional table name filter
    AND (p_table_name IS NULL OR al.resource_type = p_table_name)
    -- Optional operation filter (INSERT, UPDATE, DELETE)
    AND (p_operation IS NULL OR al.action LIKE '%:' || p_operation)
    -- Optional time range
    AND (p_start_time IS NULL OR al.created_at >= p_start_time)
    AND (p_end_time IS NULL OR al.created_at <= p_end_time)
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION query_db_audit_logs(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN) IS
  'Query database-triggered audit logs with optional filters for security investigation';

-- Function to get summary of direct database access
CREATE OR REPLACE FUNCTION get_direct_db_access_summary(
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours'
)
RETURNS TABLE (
  table_name TEXT,
  operation TEXT,
  access_count BIGINT,
  first_access TIMESTAMPTZ,
  last_access TIMESTAMPTZ,
  distinct_sessions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.resource_type::TEXT AS table_name,
    split_part(al.action, ':', 3) AS operation,
    COUNT(*) AS access_count,
    MIN(al.created_at) AS first_access,
    MAX(al.created_at) AS last_access,
    COUNT(DISTINCT (al.metadata->>'transaction_id')) AS distinct_sessions
  FROM audit_log al
  WHERE
    al.action LIKE 'DB_TRIGGER:%'
    AND al.created_at >= p_since
  GROUP BY al.resource_type, split_part(al.action, ':', 3)
  ORDER BY access_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_direct_db_access_summary(TIMESTAMPTZ) IS
  'Get summary of direct database access (bypassing application) since specified time';

-- ============================================================================
-- INDEX FOR TRIGGER-BASED ENTRIES
-- ============================================================================

-- Index to quickly find trigger-generated entries
CREATE INDEX IF NOT EXISTS idx_audit_log_db_trigger
  ON audit_log(action)
  WHERE action LIKE 'DB_TRIGGER:%';

CREATE INDEX IF NOT EXISTS idx_audit_log_app_trigger
  ON audit_log(action)
  WHERE action LIKE 'APP_TRIGGER:%';

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE audit_config IS
  'Configuration for database audit triggers';

-- Add comments about the triggers
DO $$
BEGIN
  RAISE NOTICE 'Database audit triggers created for: users, profiles, auth_credentials, matches, messages, blocks, reports';
  RAISE NOTICE 'Triggers distinguish between app access (APP_TRIGGER:*) and direct DB access (DB_TRIGGER:*)';
  RAISE NOTICE 'Application code should call mark_app_session(user_id) at transaction start';
END $$;
