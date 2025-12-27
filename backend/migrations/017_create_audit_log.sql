-- Migration 017: Create Comprehensive Audit Logging
-- Security feature for tracking authentication events and data changes
-- Essential for security incident investigation and compliance

-- Create audit_log table for comprehensive event tracking
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  ip_address VARCHAR(45), -- IPv6 addresses can be up to 45 chars
  user_agent TEXT,
  request_id VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  success BOOLEAN DEFAULT TRUE NOT NULL,
  error_message TEXT
);

-- Indexes for efficient querying
-- Primary lookup by user for user activity reports
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);

-- Lookup by action type for security analysis
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Time-based queries for incident investigation
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Resource lookup for tracking changes to specific entities
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- Compound index for common query patterns: user + action + time
CREATE INDEX IF NOT EXISTS idx_audit_log_user_action_time ON audit_log(user_id, action, created_at DESC);

-- Index for finding failed operations
CREATE INDEX IF NOT EXISTS idx_audit_log_success ON audit_log(success) WHERE success = FALSE;

-- Index for IP-based analysis (security investigations)
CREATE INDEX IF NOT EXISTS idx_audit_log_ip_address ON audit_log(ip_address) WHERE ip_address IS NOT NULL;

-- Partial index for request tracing
CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON audit_log(request_id) WHERE request_id IS NOT NULL;

-- Table comments for documentation
COMMENT ON TABLE audit_log IS 'Comprehensive audit log for security events and data changes';
COMMENT ON COLUMN audit_log.id IS 'Unique identifier for the audit entry';
COMMENT ON COLUMN audit_log.created_at IS 'Timestamp when the event occurred';
COMMENT ON COLUMN audit_log.user_id IS 'User who performed the action (NULL for anonymous/system actions)';
COMMENT ON COLUMN audit_log.action IS 'Type of action performed (e.g., LOGIN_SUCCESS, PASSWORD_CHANGE)';
COMMENT ON COLUMN audit_log.resource_type IS 'Type of resource affected (e.g., user, profile, match)';
COMMENT ON COLUMN audit_log.resource_id IS 'ID of the resource affected';
COMMENT ON COLUMN audit_log.ip_address IS 'IP address of the request origin';
COMMENT ON COLUMN audit_log.user_agent IS 'User-Agent header from the request';
COMMENT ON COLUMN audit_log.request_id IS 'Unique request ID for correlation across services';
COMMENT ON COLUMN audit_log.old_value IS 'Previous state of the resource (for data changes)';
COMMENT ON COLUMN audit_log.new_value IS 'New state of the resource (for data changes)';
COMMENT ON COLUMN audit_log.metadata IS 'Additional context-specific data';
COMMENT ON COLUMN audit_log.success IS 'Whether the action completed successfully';
COMMENT ON COLUMN audit_log.error_message IS 'Error message if action failed';

-- Function to automatically clean old audit logs (retention policy)
-- Keeps logs for 90 days by default, can be adjusted via parameter
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_log
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_audit_logs(INTEGER) IS 'Delete audit logs older than specified retention period (default 90 days)';
