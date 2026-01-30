# Apple Client Secret Rotation Runbook

## Overview

Apple Sign-In web flow requires a client secret JWT that **expires every 6 months maximum**. This runbook documents the rotation procedure.

The auth-service generates the client secret at runtime using `apple-signin-auth`'s `getClientSecret()`, which creates a JWT signed with the private key. The JWT has a maximum lifetime of 6 months (15,777,000 seconds) as enforced by Apple.

## Schedule

| Event | Action |
|-------|--------|
| Initial setup | Configure env vars, set calendar reminder |
| 5.5 months | Verify sign-in still working, prepare for key rotation if needed |
| 6 months | Private key rotation deadline (if key was compromised or needs replacement) |

**Calendar reminder:** Set for 5.5 months after initial deployment or last key rotation.

**Note:** Because the client secret is generated at runtime on each request, the 6-month expiry resets automatically. The primary rotation concern is the **private key (.p8 file)**, which does not expire but should be rotated if compromised.

## Prerequisites

- Access to Apple Developer Portal (Account Holder or Admin role)
- Access to Railway dashboard
- Private key (.p8 file) stored securely

## Environment Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `APPLE_SERVICES_ID` | Services ID identifier | Apple Developer Portal > Identifiers > Services IDs |
| `APPLE_TEAM_ID` | 10-character Team ID | Apple Developer Portal > Membership |
| `APPLE_KEY_ID` | 10-character Key ID | Apple Developer Portal > Keys |
| `APPLE_PRIVATE_KEY` | Contents of .p8 file | Apple Developer Portal > Keys > Download |
| `APPLE_REDIRECT_URI` | Callback URL | Railway auth-service URL + /auth/apple/callback |

## Rotation Steps

### 1. Verify Current Status

Check current sign-in health:
- Railway auth-service logs: Search for "Apple web sign-in" entries
- If users report failures, check for "invalid_client" errors
- If failing with "invalid_client", the private key may be invalid or revoked

### 2. Generate New Private Key

The private key (.p8 file) is the only credential that needs rotation. The client secret JWT is generated fresh on each authentication request.

**To create a new key:**

1. Go to [Apple Developer Portal > Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Click **+** to create a new key
3. Name: "VLVT Sign In Key" (or similar descriptive name)
4. Enable **Sign in with Apple**
5. Click **Configure** next to Sign in with Apple
6. Select your Primary App ID
7. Click **Save**, then **Continue**, then **Register**
8. **Download the .p8 file** (you can only download it once!)
9. Note the **Key ID** (10 characters, displayed after creation)

### 3. Update Railway Environment

1. Go to Railway Dashboard > auth-service > Variables
2. Update `APPLE_KEY_ID` with the new Key ID
3. Update `APPLE_PRIVATE_KEY` with the new key contents:
   - Open .p8 file in a text editor
   - Copy the entire content including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
   - Paste into Railway (supports multiline values)
4. Click **Save** (triggers automatic redeploy)

### 4. Verify Rotation

1. Wait for Railway deploy to complete (check deploy logs)
2. Test Apple Sign-In on an Android device
3. Check Railway logs for "Apple web sign-in successful" message
4. Verify no "invalid_client" errors in logs

### 5. Post-Rotation Cleanup

1. Set calendar reminder for 5.5 months from now
2. Store .p8 file in a secure location (password manager or encrypted drive)
3. **Do NOT delete the old key immediately** - wait 24 hours to ensure no cached requests fail
4. After 24 hours, revoke the old key in Apple Developer Portal if desired

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_client` | Client secret invalid (wrong key, revoked key) | Verify `APPLE_PRIVATE_KEY` and `APPLE_KEY_ID` are correct |
| `invalid_grant` | Authorization code expired (>5 minutes old) | User needs to re-authenticate; no server-side fix needed |
| `503 - Apple Sign-In web flow not configured` | Missing environment variables | Check all `APPLE_*` variables are set in Railway |
| `401 - Failed to get identity token` | Apple returned empty token response | Check `APPLE_REDIRECT_URI` matches Apple Developer Portal |
| `401 - Invalid identity token claims` | Token audience mismatch | Verify `APPLE_SERVICES_ID` matches the Services ID in Portal |

## Emergency Recovery

If Apple Sign-In on Android is broken:

1. **Immediate impact:** Only affects Android users using Apple Sign-In
2. **Short-term mitigation:** Users can sign in with Google or email/password instead
3. **Diagnosis steps:**
   - Check Railway auth-service logs for the specific error message
   - Verify all `APPLE_*` environment variables are set
   - Check Apple Developer Portal for key/service status
4. **If key is compromised:**
   - Revoke the compromised key immediately in Apple Developer Portal
   - Generate a new key following the rotation steps above
   - Update Railway environment variables
5. **If Services ID is misconfigured:**
   - Verify Services ID configuration in Apple Developer Portal
   - Check that "Sign in with Apple" is enabled for the Services ID
   - Verify the Return URL matches `APPLE_REDIRECT_URI`

## Related Documentation

- [Apple Sign-In Web Flow Documentation](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js)
- [Apple REST API Reference](https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens)
- Auth service endpoint: `POST /auth/apple/web`
- Environment variable audit: `.planning/phases/06-deployment-infrastructure/06-01-SUMMARY.md`
