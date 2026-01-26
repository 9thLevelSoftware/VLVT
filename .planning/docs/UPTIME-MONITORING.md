# Uptime Monitoring Configuration

## Overview

VLVT uses UptimeRobot for continuous external uptime monitoring. Railway's built-in health checks only run at deploy time, so external monitoring is required to detect downtime between deployments.

## Service: UptimeRobot

**Plan:** Free tier (50 monitors, 5-minute intervals)
**Dashboard:** https://uptimerobot.com/dashboard
**Setup:** https://uptimerobot.com (free account)

## Monitors to Configure

### Production Endpoints

| Monitor Name | URL | Type | Interval |
|--------------|-----|------|----------|
| VLVT Auth Service | `https://[RAILWAY-AUTH-URL]/health` | HTTP(s) | 5 min |
| VLVT Profile Service | `https://[RAILWAY-PROFILE-URL]/health` | HTTP(s) | 5 min |
| VLVT Chat Service | `https://[RAILWAY-CHAT-URL]/health` | HTTP(s) | 5 min |

> **Note:** Replace `[RAILWAY-*-URL]` with actual Railway production URLs from your Railway dashboard.

### Alert Configuration

1. **Alert Contacts:** Add your email address for downtime notifications
2. **Alert Threshold:** Alert after 2 consecutive failures (10 minutes of downtime)
3. **Recovery Alert:** Enable to receive notification when service recovers
4. **Notification Frequency:** Every 30 minutes while down (avoid alert fatigue)

## Expected Health Response

All services return JSON health check responses via the `/health` endpoint (implemented in 05-02):

```json
{
  "status": "ok",
  "service": "auth-service",
  "timestamp": "2026-01-25T12:00:00.000Z",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 5
    }
  },
  "version": {
    "commit": "abc123",
    "environment": "production"
  }
}
```

### Status Codes

| Status Code | Status Field | Meaning | Action |
|-------------|--------------|---------|--------|
| 200 | `"ok"` | Service healthy | None required |
| 503 | `"degraded"` | Dependency down (e.g., database) | Check database connectivity in Railway |
| 5xx | - | Service error | Check Railway logs for errors |
| Timeout | - | Service unreachable | Check Railway deployment status |

## Setup Steps

### 1. Create UptimeRobot Account

1. Go to https://uptimerobot.com
2. Click "Register for FREE"
3. Complete email verification

### 2. Add Monitors

For each service (Auth, Profile, Chat):

1. Click "Add New Monitor"
2. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** VLVT [Service] Service
   - **URL:** `[Railway URL]/health`
   - **Monitoring Interval:** 5 minutes (free tier minimum)
3. Under "Alert Contacts," select your email
4. Click "Create Monitor"

### 3. Verify Setup

After adding monitors:
1. Wait 5 minutes for first check
2. All monitors should show green "UP" status
3. Test alerts by temporarily setting an invalid URL

## Railway Production URLs

Get production URLs from Railway dashboard:

**Via Railway CLI:**
```bash
railway service auth-service domain
railway service profile-service domain
railway service chat-service domain
```

**Via Railway Dashboard:**
1. Open Railway dashboard
2. Select service (auth-service, profile-service, or chat-service)
3. Go to Settings > Networking > Public Domain
4. Copy the domain URL

## Monitoring Best Practices

### Alert Response Procedure

1. **Receive downtime alert** - Check email or UptimeRobot dashboard
2. **Verify the outage** - Visit the health endpoint directly
3. **Check Railway logs** - Look for error patterns
4. **Check Railway status** - railway.app/status for platform issues
5. **Investigate database** - If health check shows database degraded
6. **Document incident** - Log in team channel with resolution

### Dashboard Review Cadence

- **Weekly:** Review uptime percentages
- **Monthly:** Review response time trends
- **After incidents:** Post-mortem and root cause analysis

## Integration with Sentry

Health check failures correlate with Sentry alerts:
- Service crashes trigger both Sentry errors AND health check failures
- Database connectivity issues show as "degraded" health + Sentry rate limit warnings
- Use correlation IDs from logs to trace issues across both systems

## Limitations

**Free Tier Constraints:**
- 50 monitors maximum
- 5-minute check interval (not faster)
- No SMS alerts (email only)
- 2 months of logs

**Consider upgrading if:**
- Need sub-5-minute monitoring
- Need SMS/Slack/webhook alerts
- Monitor count exceeds 50
- Need longer log retention

---

*Document created: 2026-01-26*
*Last updated: 2026-01-26*
*Related: 05-02-SUMMARY.md (health check implementation), 05-01-SUMMARY.md (Sentry integration)*
