# Phase 6: Deployment Infrastructure - Context

**Gathered:** 2026-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure data can be recovered and deployments are auditable. PostgreSQL backups to R2 with 30-day retention, documented environment variables, no secrets in source code, and database restore capability within 1 hour. Does NOT include CI/CD pipeline changes, blue-green deployments, or infrastructure-as-code.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User indicated trust in best practices for all deployment infrastructure decisions. Claude has flexibility on:

**Backup Scheduling:**
- Timing of daily backups (recommend off-peak hours)
- Backup failure notification mechanism
- Retry policy for failed backups
- Backup verification approach

**Restore Workflow:**
- Documentation format for restore procedures
- Verification steps post-restore
- Test environment for restore validation

**Environment Management:**
- Format for environment variable documentation (recommend table format in docs)
- Organization of secrets vs non-sensitive config
- Naming conventions for environment variables

**Operational Runbooks:**
- Level of detail in procedures
- Storage location for runbooks (recommend .planning/runbooks/ or docs/)
- Format (markdown with step-by-step commands)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User trusts Claude's judgment on operational best practices.

Key constraints from requirements:
- Daily backups to R2 (Cloudflare)
- 30-day retention period
- Restore time target: 1 hour
- Railway deployment platform

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

Tracked from earlier phases:
- DEP-05: Email service configuration (tracked in Phase 4)
- DEP-06: Apple Sign-In on Android handling (tracked in Phase 4)

</deferred>

---

*Phase: 06-deployment-infrastructure*
*Context gathered: 2026-01-25*
