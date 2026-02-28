---
phase: 06-deployment-infrastructure
plan: 03
subsystem: auth
tags: [apple-sign-in, android, web-flow, oauth, client-secret]
depends_on:
  requires: [01-01, 01-04, 06-01]
  provides: ["Apple web flow endpoint /auth/apple/web", "Apple secret rotation runbook"]
  affects: [06-04, 07-xx]
tech_stack:
  added: []
  patterns: ["Authorization code exchange", "Client secret JWT generation", "Services ID audience validation"]
key_files:
  created:
    - docs/runbooks/apple-secret-rotation.md
  modified:
    - backend/auth-service/src/index.ts
    - backend/auth-service/.env.example
decisions:
  - id: DEP-06-WEB-FLOW
    choice: "Authorization code exchange via apple-signin-auth (getClientSecret + getAuthorizationToken)"
    why: "Web flow requires server-side code exchange unlike native flow's direct id_token verification"
  - id: DEP-06-SERVICES-ID
    choice: "Separate APPLE_SERVICES_ID env var (distinct from APPLE_CLIENT_ID)"
    why: "Web flow uses Services ID as audience, native iOS uses App ID; different Apple identifiers"
  - id: DEP-06-CSRF-SKIP
    choice: "Added /auth/apple/web to CSRF skipPaths"
    why: "OAuth endpoint called before user has session/Bearer token, same pattern as other auth endpoints"
  - id: DEP-06-TOKEN-PAIR
    choice: "Use issueTokenPair() instead of raw jwt.sign()"
    why: "Matches native flow pattern: short-lived access token + hashed refresh token in database"

requirements-completed: [DEP-06]

metrics:
  duration: "~3 minutes"
  completed: "2026-01-30"
---

# Phase 6 Plan 3: Apple Sign-In Web Flow Summary

**Apple web sign-in endpoint for Android using authorization code exchange with apple-signin-auth**

## What Was Done

### Task 1: Apple Web Flow Endpoint (74bd27d)

Added `POST /auth/apple/web` endpoint to `backend/auth-service/src/index.ts` for Android users who sign in with Apple via the web-based OAuth flow.

**Key implementation details:**

1. **Environment validation** -- Checks for all 5 required env vars (APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_REDIRECT_URI); returns 503 if not configured
2. **Client secret generation** -- Uses `appleSignin.getClientSecret()` to create a JWT signed with the private key (6-month max expiry)
3. **Authorization code exchange** -- Calls `appleSignin.getAuthorizationToken()` to exchange the authorization code for tokens
4. **Token verification** -- Verifies the id_token from Apple using Services ID as audience (not App ID)
5. **User creation/linking** -- Same pattern as native flow: checks existing credentials, links by email, or creates new user with transaction safety
6. **Token issuance** -- Uses `issueTokenPair()` for consistent 15-minute access token + hashed refresh token

**Differences from native `/auth/apple` flow:**

| Aspect | Native (iOS) | Web (Android) |
|--------|--------------|---------------|
| Input | Identity token directly | Authorization code |
| Secret | None needed | Client secret JWT |
| Audience | App ID (APPLE_CLIENT_ID) | Services ID (APPLE_SERVICES_ID) |
| Nonce | Required (replay protection) | Not used (handled in auth request) |
| Verification | Direct id_token verify | Code exchange then id_token verify |

Also added `/auth/apple/web` and `/api/v1/auth/apple/web` to CSRF middleware skipPaths, following the same pattern as all other OAuth authentication endpoints.

### Task 2: Environment Documentation and Rotation Runbook (acc1c97)

**Part A: .env.example updates**

Added 5 commented Apple web flow variables to `backend/auth-service/.env.example` with sourcing instructions:
- `APPLE_SERVICES_ID` -- Apple Developer Portal > Identifiers > Services IDs
- `APPLE_TEAM_ID` -- Apple Developer Portal > Membership
- `APPLE_KEY_ID` -- Apple Developer Portal > Keys
- `APPLE_PRIVATE_KEY` -- Contents of .p8 file (not file path)
- `APPLE_REDIRECT_URI` -- Railway auth-service URL + /auth/apple/callback

**Part B: Rotation runbook**

Created `docs/runbooks/apple-secret-rotation.md` covering:
- 6-month rotation schedule with calendar reminder at 5.5 months
- Step-by-step private key rotation procedure
- Railway environment variable update process
- Troubleshooting table (invalid_client, invalid_grant, 503, 401 errors)
- Emergency recovery steps (alternative sign-in methods, key compromise response)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] CSRF skipPaths for new endpoint**

- **Found during:** Task 1
- **Issue:** The plan specified adding the endpoint but did not mention CSRF middleware configuration. The new `/auth/apple/web` endpoint would be blocked by CSRF middleware since it's called before users have a session.
- **Fix:** Added `/auth/apple/web` and `/api/v1/auth/apple/web` to the CSRF skipPaths list, following the same pattern as existing OAuth endpoints.
- **Files modified:** backend/auth-service/src/index.ts
- **Commit:** 74bd27d

**2. [Rule 2 - Missing Critical] Used issueTokenPair() instead of raw jwt.sign()**

- **Found during:** Task 1
- **Issue:** The plan's code template used raw `jwt.sign()` and manual refresh token INSERT, but the codebase has a standardized `issueTokenPair()` function that handles hashed refresh tokens, device info tracking, and consistent expiry.
- **Fix:** Used `issueTokenPair()` like the native Apple and Google endpoints do, ensuring consistent token issuance with hashed refresh token storage.
- **Files modified:** backend/auth-service/src/index.ts
- **Commit:** 74bd27d

## Verification Results

- [x] `/auth/apple/web` endpoint added to auth-service (line 613)
- [x] `getClientSecret` call present for client secret generation (line 630)
- [x] `APPLE_SERVICES_ID` referenced in endpoint and .env.example
- [x] TypeScript compilation passes (`tsc --noEmit` clean)
- [x] Environment variables documented in .env.example
- [x] Rotation runbook exists at docs/runbooks/apple-secret-rotation.md

## Pending: Checkpoint (Task 3)

Task 3 is a `checkpoint:human-verify` requiring Apple Developer Portal configuration and Railway environment variable setup. The code is deployed and ready; the user must:

1. Create/configure Apple Services ID in Apple Developer Portal
2. Set all 5 `APPLE_*` environment variables in Railway
3. Test Apple Sign-In on an Android device

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 74bd27d | feat | Add Apple Sign-In web flow endpoint for Android |
| acc1c97 | docs | Apple web flow env vars and secret rotation runbook |
