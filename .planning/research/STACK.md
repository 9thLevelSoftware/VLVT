# Technology Stack: VLVT Production Readiness

**Project:** VLVT Dating App - Production Readiness for Beta Launch
**Researched:** 2026-01-24
**Overall Confidence:** HIGH

## Executive Summary

This document recommends the tools, libraries, and services needed to make VLVT production-ready for beta launch. The recommendations cover six key areas: security scanning and auditing, testing frameworks, monitoring and alerting, GDPR compliance tooling, database backup solutions, and logging best practices. The existing stack (Node.js/TypeScript + Flutter + PostgreSQL + Redis + Railway) is solid; these additions harden it for production use with sensitive dating app data.

---

## 1. Security Scanning & Auditing

### Recommended Tools

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Snyk CLI** | ^1.1302.0+ | Dependency & code vulnerability scanning | Developer-first, supports SAST + SCA, Yarn 4/pnpm support, CI/CD integration | HIGH |
| **npm audit** | (built-in) | Quick dependency vulnerability check | Zero-config baseline, catches known CVEs | HIGH |
| **eslint-plugin-security** | ^3.0.1 | Static code security linting | Catches common Node.js security anti-patterns | HIGH |
| **Socket.dev** | (online) | Pre-install package vetting | Flags network access, install scripts, obfuscated code | MEDIUM |

**Rationale:**

The npm ecosystem saw 2,168+ malicious package reports in 2024, with 56% designed for data exfiltration in Q1 2025. A dating app handling location, photos, and intimate messages is a high-value target. Multi-layer security scanning is essential.

**Why Snyk over alternatives:**
- **vs npm audit alone**: Snyk provides SAST (code analysis), not just SCA (dependency scanning)
- **vs SonarQube**: SonarQube requires self-hosting; Snyk is SaaS with free tier
- **vs Semgrep**: Snyk has better Node.js/TypeScript coverage out-of-box
- Snyk Code finds vulnerabilities in custom code (XSS, injection, auth bypass)
- Supports lockfile v3, Yarn 4, pnpm (recent additions in v1.1302.0)

**eslint-plugin-security catches:**
- `detect-eval-with-expression` - eval() with user input
- `detect-non-literal-fs-filename` - path traversal risks
- `detect-no-csrf-before-method-override` - CSRF vulnerabilities
- `detect-possible-timing-attacks` - timing attacks in auth

**Implementation:**

```bash
# Install security tooling (each service)
npm install -D eslint-plugin-security@^3.0.1 snyk@latest

# Add to CI pipeline
npm audit --audit-level=high
npx snyk test --severity-threshold=high
npx snyk code test

# Pre-commit check (package.json scripts)
"lint:security": "eslint --plugin security --ext .ts src/"
```

**ESLint flat config (eslint.config.js):**

```javascript
import pluginSecurity from 'eslint-plugin-security';

export default [
  pluginSecurity.configs.recommended,
  // ... other configs
];
```

**Sources:**
- [Snyk npm package](https://www.npmjs.com/package/snyk)
- [Snyk Product Updates](https://updates.snyk.io/)
- [eslint-plugin-security](https://github.com/eslint-community/eslint-plugin-security)
- [Geekflare Node.js Security Tools](https://geekflare.com/nodejs-security-scanner/)
- [npm Security Guide](https://blog.cyberdesserts.com/npm-security-vulnerabilities/)

---

## 2. Testing Frameworks

### Backend Testing (Node.js/TypeScript)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Jest** | ^29.7.0 | Unit & integration testing | Already in stack, fast, excellent TypeScript support | HIGH |
| **Supertest** | ^7.1.4 | HTTP API testing | Already in stack, integrates seamlessly with Jest | HIGH |
| **testcontainers** | ^10.x | Integration test containers | Spin up real PostgreSQL/Redis for tests, ensures parity with production | HIGH |

**Note:** Jest and Supertest are already installed across all services. Focus on improving coverage and adding integration tests with real databases.

**Coverage targets (update jest config):**

```json
"coverageThreshold": {
  "global": {
    "branches": 70,
    "functions": 70,
    "lines": 70,
    "statements": 70
  }
}
```

**Why testcontainers:**
- Mocking PostgreSQL/Redis leads to false confidence
- testcontainers spins up actual containers for tests
- Tests match production behavior exactly
- Clean slate per test run

### Frontend Testing (Flutter)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **flutter_test** | (SDK) | Unit & widget testing | Built-in, fast, excellent widget testing | HIGH |
| **Patrol** | ^3.11.0 | E2E/integration testing | Flutter-first, handles native UI (permissions, notifications) | HIGH |
| **integration_test** | (SDK) | Basic integration testing | Built-in, but limited native interaction | MEDIUM |

**Why Patrol over alternatives:**

Patrol is the recommended E2E testing framework for Flutter apps with native interactions. Key advantages:
- Interacts with native permission dialogs, notifications, WebViews
- Written in pure Dart (vs Maestro's YAML)
- Uses UIAutomator (Android) and XCUITest (iOS) under the hood
- Supports Firebase Test Lab, BrowserStack, LambdaTest
- Hot restart support for faster test development

**vs flutter integration_test:** Built-in integration_test cannot interact with platform dialogs. A dating app needs to test:
- Location permission flows
- Push notification permission
- Camera/photo library permissions
- OAuth login WebViews

Patrol handles all of these from Dart code.

**Installation:**

```yaml
# pubspec.yaml
dev_dependencies:
  patrol: ^3.11.0
```

```bash
# Install patrol_cli
dart pub global activate patrol_cli
```

**Minimum requirements:**
- Flutter SDK >= 3.24.0
- Dart SDK >= 3.5.0

**Coverage reporting:**

```bash
# Generate coverage
flutter test --coverage

# Generate HTML report (requires lcov)
genhtml coverage/lcov.info -o coverage/html

# CI integration with Codecov/SonarQube
# SonarQube: set sonar.dart.lcov.reportPaths=coverage/lcov.info
```

**Sources:**
- [Patrol documentation](https://patrol.leancode.co/)
- [Patrol pub.dev](https://pub.dev/packages/patrol)
- [Flutter Test Coverage Guide](https://codewithandrea.com/articles/flutter-test-coverage/)
- [Allure for Flutter Test Reports](https://www.verygood.ventures/blog/elevating-flutter-test-reports-with-allure)

---

## 3. Monitoring & Alerting

### Application Performance Monitoring (APM)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Sentry** | ^10.34.0 | Error tracking & APM | Already integrated (@sentry/node), excellent Node.js support, continuous profiling | HIGH |
| **Railway Metrics** | (platform) | Infrastructure metrics | Built-in, zero-config, CPU/memory/network | HIGH |
| **Railway Alerts** | (platform) | Threshold-based alerting | Sends to Slack/Discord/email when conditions met | HIGH |

**Why keep Sentry (already in stack):**

Sentry is already installed in all three backend services (`@sentry/node: ^10.25.0`). Upgrade to latest (^10.34.0) for:
- Vercel AI SDK v6 support
- GraphQL persisted operations support
- Continuous profiling (no time limits)
- OpenTelemetry integration

**Sentry configuration for production:**

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,  // 20% of transactions for APM
  profilesSampleRate: 0.1, // 10% of transactions for profiling
  integrations: [
    Sentry.httpIntegration(),
    Sentry.expressIntegration(),
    Sentry.postgresIntegration(),
    Sentry.redisIntegration(),
  ],
});
```

**Railway alerting setup:**

Railway provides built-in monitoring with alerts to Slack/Discord/email. Configure thresholds:
- CPU > 80% for 5 minutes
- Memory > 85%
- Response time p95 > 2s
- Error rate > 1%

**Webhook integration for custom alerts:**

```
Deployment state changes -> Slack/Discord webhook
Custom events -> Railway webhooks with auto-transform
```

### Uptime Monitoring

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Better Uptime** | (SaaS) | External uptime checks | Simple, free tier, integrates with incident management | MEDIUM |
| **StatusGator** | (SaaS) | Railway status aggregation | Monitors Railway platform status, proactive alerts | LOW |

**Sources:**
- [Sentry Node.js SDK](https://docs.sentry.io/platforms/node/)
- [@sentry/node npm](https://www.npmjs.com/package/@sentry/node)
- [Railway Monitoring Docs](https://docs.railway.com/guides/monitoring)
- [Better Stack Node.js APM Comparison](https://betterstack.com/community/comparisons/nodejs-application-monitoring-tools/)
- [Sentry Alternatives Comparison](https://last9.io/blog/the-best-sentry-alternatives/)

---

## 4. GDPR Compliance Tooling

### Data Subject Request (DSAR) Implementation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Custom DSAR API** | N/A | Handle access/deletion requests | Core GDPR requirement, must be built in-house | HIGH |
| **gdpr-subject-rights-api** | (OpenAPI spec) | API design reference | F-Secure open-source spec for DSAR endpoints | MEDIUM |

**GDPR requirements for dating apps:**

GDPR enforcement intensified with 2,245 fines totaling 5.65B EUR by March 2025. Dating apps with sensitive data (location, photos, messages, After Hours Mode content) face heightened scrutiny.

**Required capabilities:**
1. **Right of Access** - Export all user data within 30 days
2. **Right to Erasure** - Delete all user data on request
3. **Right to Rectification** - Allow users to correct data
4. **Data Portability** - Export in machine-readable format (JSON)
5. **Consent Management** - Track and honor consent choices

**API endpoints to implement:**

```typescript
// DSAR endpoints (auth-service or dedicated service)
POST   /api/v1/dsar/access-request    // Request data export
GET    /api/v1/dsar/access-request/:id // Check request status
POST   /api/v1/dsar/deletion-request  // Request account deletion
GET    /api/v1/dsar/deletion-request/:id
GET    /api/v1/me/data-export        // Immediate data download
DELETE /api/v1/me/account            // Self-service deletion

// Response within 30 days (extendable to 90 for complex cases)
```

### Data Encryption

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **pgcrypto** | (PostgreSQL extension) | Column-level encryption | Encrypt sensitive fields (messages, exact location) | HIGH |
| **Node.js crypto** | (built-in) | Application-level encryption | Encrypt before database storage | HIGH |

**Encryption strategy:**

```
Storage-level:  Railway PostgreSQL has encryption at rest (platform level)
Application-level: Encrypt sensitive columns before INSERT
                   - exact_latitude/exact_longitude (store fuzzed in clear)
                   - after_hours_messages.content
                   - Any PII beyond profile basics
```

**Application-level encryption pattern:**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}
```

### GDPR-Compliant Logging

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Winston** | ^3.18.3 | Structured logging | Already in stack, supports log rotation | HIGH |

**GDPR logging requirements:**
- Never log PII in plain text (user IDs OK, emails/names NOT OK)
- Implement log rotation (30-day retention max for non-audit logs)
- Anonymize/pseudonymize before logging
- Encrypt logs at rest

**Sources:**
- [GDPR Subject Rights API (F-Secure)](https://github.com/F-Secure/gdpr-subject-rights-api)
- [API Data Protection GDPR Guide](https://complydog.com/blog/api-data-protection-developers-gdpr-implementation-guide)
- [GDPR Compliance Software Comparison](https://sprinto.com/blog/gdpr-compliance-software/)
- [GDPR-Compliant Logging Checklist](https://www.bytehide.com/blog/gdpr-compliant-logging-a-javascript-developers-checklist)
- [PostgreSQL Encryption Best Practices](https://www.enterprisedb.com/postgresql-best-practices-encryption-monitoring)

---

## 5. Database Backup Solutions

### Railway PostgreSQL Backups

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Railway Postgres Daily Backups** | (template) | Automated daily backups | Official template, version-aware pg_dump, retention policies | HIGH |
| **PostgreSQL S3 Backups** | (template) | Backup to Cloudflare R2 | Compatible with R2 (already used for photos), TypeScript-based | HIGH |

**Why use Railway templates:**

Railway provides official templates that:
- Auto-detect PostgreSQL version (15-17)
- Use correct pg_dump version for compatibility
- Organize backups with date-based directories
- Include Prometheus metrics for monitoring
- Support respawn protection (prevent excessive backups)
- Allow custom retention policies

**Recommended setup:**

Since VLVT already uses Cloudflare R2 for photo storage, use the same bucket (or separate backup bucket) for database backups.

**Configuration:**

```
BACKUP_DATABASE_URL=postgresql://...  # Railway connection string
BACKUP_CRON_EXPRESSION=0 3 * * *      # Daily at 3 AM UTC
AWS_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
AWS_S3_BUCKET=vlvt-backups
AWS_ACCESS_KEY_ID=<R2 access key>
AWS_SECRET_ACCESS_KEY=<R2 secret>
BACKUP_RETENTION_DAYS=30
```

**Restoration process:**

```bash
# Download and decompress backup
gunzip backup-2026-01-24.tar.gz

# Restore to database
pg_restore -d $DATABASE_URL backup-2026-01-24.tar
```

**Point-in-time recovery (PITR):**

Railway's managed PostgreSQL includes WAL archiving for point-in-time recovery on higher tiers. For beta launch, daily backups with 30-day retention is sufficient.

**Sources:**
- [Railway PostgreSQL Backup Guide](https://blog.railway.com/p/postgre-backup)
- [Automated PostgreSQL Backups](https://blog.railway.com/p/automated-postgresql-backups)
- [postgres-s3-backups template](https://github.com/railwayapp-templates/postgres-s3-backups)

---

## 6. Logging Best Practices

### Recommended Stack

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Winston** | ^3.18.3 | Structured logging | Already in stack, mature, flexible transports | HIGH |
| **OR Pino** | ^9.x | High-performance logging | 5-10x faster than Winston, JSON-native, better for high-throughput | HIGH |

**Winston vs Pino decision:**

- **Keep Winston if:** Existing logging works, you need multiple transports (file, console, external), flexibility is priority
- **Switch to Pino if:** Performance is critical, you prefer JSON-first approach, microservices need minimal logging overhead

**Recommendation:** Keep Winston for now (already integrated), but configure it properly for production.

### Production Logging Configuration

**Winston configuration (recommended):**

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'auth-service',
    version: process.env.npm_package_version
  },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
    })
  ]
});

// Add correlation ID middleware
export function correlationMiddleware(req, res, next) {
  req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
}
```

**Best practices:**

1. **Use structured JSON in production** - Railway log aggregation works best with JSON
2. **Include correlation IDs** - Trace requests across services
3. **Log levels:**
   - ERROR: Failures requiring attention
   - WARN: Degraded but functional
   - INFO: Significant events (auth, key actions)
   - DEBUG: Development troubleshooting only
4. **Never log:**
   - Passwords, tokens, API keys
   - Full email addresses (log domain only)
   - Exact location coordinates (log city/area)
   - Message content

**Sources:**
- [Node.js Logging Best Practices](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/)
- [Pino vs Winston Comparison](https://betterstack.com/community/comparisons/pino-vs-winston/)
- [Node.js Logging Libraries 2025](https://last9.io/blog/node-js-logging-libraries/)

---

## 7. JWT Security Hardening

### Current State & Recommendations

| Aspect | Current | Recommended | Confidence |
|--------|---------|-------------|------------|
| **Algorithm** | HS256 (assumed) | RS256 or ES256 | HIGH |
| **Access Token TTL** | Unknown | 15 minutes | HIGH |
| **Refresh Token TTL** | Unknown | 7 days | HIGH |
| **Token Rotation** | Unknown | Enabled | HIGH |

**Why asymmetric algorithms (RS256/ES256):**

For microservices architecture, asymmetric algorithms (RS256, ES256) are strongly recommended:
- Private key stays with auth-service
- Public key distributed to profile-service, chat-service for verification
- No shared secrets across services
- Easier key rotation via JWKS endpoints

**Implementation pattern:**

```typescript
// auth-service: Sign with private key
import jwt from 'jsonwebtoken';
const privateKey = fs.readFileSync('private.pem');

const accessToken = jwt.sign(
  { userId, type: 'access' },
  privateKey,
  { algorithm: 'RS256', expiresIn: '15m' }
);

// profile-service/chat-service: Verify with public key
const publicKey = fs.readFileSync('public.pem');
// Or fetch from JWKS endpoint: https://auth.vlvt.app/.well-known/jwks.json

jwt.verify(token, publicKey, { algorithms: ['RS256'] });
```

**Refresh token rotation:**

```typescript
// On refresh token use:
// 1. Validate refresh token
// 2. Issue new access token
// 3. Issue NEW refresh token
// 4. Invalidate OLD refresh token
// 5. If old refresh token is reused: REVOKE ALL tokens for user (indicates theft)
```

**Sources:**
- [JWT Security Best Practices 2025](https://jwt.app/blog/jwt-best-practices/)
- [RS256 vs HS256 Comparison](https://supertokens.com/blog/rs256-vs-hs256)
- [JWT Best Practices Checklist](https://curity.io/resources/learn/jwt-best-practices/)
- [Refresh Token Rotation Guide](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/)

---

## 8. Socket.IO Security Checklist

### Production Hardening

| Check | Status | Action |
|-------|--------|--------|
| **Upgrade adapter** | Required | Replace `socket.io-redis` with `@socket.io/redis-adapter` |
| **Auth middleware** | Verify | Validate JWT on connection, not just on events |
| **Rate limiting** | Verify | Limit events per connection per second |
| **Input validation** | Verify | Validate all incoming event data |
| **Room authorization** | Critical | Verify user belongs to room before join |

**Socket.IO security implementation:**

```typescript
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

const io = new Server(server, {
  cors: {
    origin: ['https://vlvt.app'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Auth middleware - verify JWT on every connection
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const decoded = await verifyJWT(token);
    socket.data.userId = decoded.userId;
    next();
  } catch {
    next(new Error('Authentication required'));
  }
});

// Room authorization - verify before join
socket.on('join:chat', async (roomId) => {
  const isAuthorized = await checkRoomMembership(socket.data.userId, roomId);
  if (!isAuthorized) {
    socket.emit('error', { message: 'Not authorized' });
    return;
  }
  socket.join(roomId);
});
```

**Sources:**
- [Socket.IO Security Best Practices](https://ably.com/topic/socketio)
- [WebSocket Security Vulnerabilities](https://ably.com/topic/websocket-security)

---

## Installation Summary

### Backend - All Services

```bash
# Security scanning
npm install -D snyk@latest eslint-plugin-security@^3.0.1

# Testing (if adding testcontainers)
npm install -D testcontainers@^10.0.0

# Socket.IO adapter upgrade (chat-service only)
npm uninstall socket.io-redis
npm install @socket.io/redis-adapter@^8.3.0

# Update Sentry
npm install @sentry/node@^10.34.0
```

### Frontend

```yaml
# pubspec.yaml additions
dev_dependencies:
  patrol: ^3.11.0
```

### CI/CD Pipeline Additions

```yaml
# Add to Railway/GitHub Actions
steps:
  - name: Security Scan
    run: |
      npm audit --audit-level=high
      npx snyk test --severity-threshold=high

  - name: Test with Coverage
    run: |
      npm run test:coverage

  - name: Flutter Tests
    run: |
      flutter test --coverage
      patrol test
```

---

## What NOT to Use

| Category | Avoid | Why |
|----------|-------|-----|
| **Security** | OWASP ZAP alone | Great for web apps, but VLVT is API + mobile; use Snyk for code |
| **Testing** | Maestro | YAML-based, less Flutter-native than Patrol |
| **Testing** | Appium | Heavy, complex setup, not Flutter-optimized |
| **Monitoring** | Datadog | Expensive, overkill for beta; Sentry + Railway is sufficient |
| **Monitoring** | New Relic | Cost prohibitive for startup, Sentry covers needs |
| **Logging** | console.log | No structure, no levels, impossible to aggregate |
| **Logging** | Bunyan | Unmaintained since 2021 |
| **GDPR** | OneTrust | Enterprise pricing, overkill for beta; build minimal DSAR API |
| **Backups** | Manual pg_dump | Error-prone, no monitoring, no retention policy |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Security Scanning (Snyk) | HIGH | Verified via npm, official docs, recent 2025 updates |
| Testing (Jest/Supertest) | HIGH | Already in stack, well-documented |
| Testing (Patrol) | HIGH | Verified via pub.dev, active development, v3.11.0 recent |
| Monitoring (Sentry) | HIGH | Already in stack, verified version ^10.34.0 |
| Railway Alerting | HIGH | Verified via Railway docs |
| GDPR Compliance | MEDIUM | Implementation patterns verified, specifics depend on legal review |
| Database Backups | HIGH | Railway official templates, verified |
| Logging (Winston) | HIGH | Already in stack, configuration patterns verified |
| JWT Security | HIGH | Best practices well-documented, implementation straightforward |

---

## Sources Summary

### Security
- [Snyk npm](https://www.npmjs.com/package/snyk)
- [eslint-plugin-security](https://github.com/eslint-community/eslint-plugin-security)
- [Node.js Security Scanners](https://geekflare.com/nodejs-security-scanner/)
- [npm Security Guide](https://blog.cyberdesserts.com/npm-security-vulnerabilities/)

### Testing
- [Patrol Documentation](https://patrol.leancode.co/)
- [Flutter Test Coverage](https://codewithandrea.com/articles/flutter-test-coverage/)
- [Allure Flutter Reports](https://www.verygood.ventures/blog/elevating-flutter-test-reports-with-allure)

### Monitoring
- [Sentry Node.js Docs](https://docs.sentry.io/platforms/node/)
- [Railway Monitoring](https://docs.railway.com/guides/monitoring)
- [Node.js APM Comparison](https://betterstack.com/community/comparisons/nodejs-application-monitoring-tools/)

### GDPR
- [GDPR Subject Rights API](https://github.com/F-Secure/gdpr-subject-rights-api)
- [GDPR Compliance Automation](https://secureprivacy.ai/blog/gdpr-compliance-automation)
- [PostgreSQL Encryption](https://www.enterprisedb.com/postgresql-best-practices-encryption-monitoring)

### Backups
- [Railway PostgreSQL Backups](https://blog.railway.com/p/postgre-backup)
- [Automated Backups Template](https://blog.railway.com/p/automated-postgresql-backups)

### Logging
- [Node.js Logging Best Practices](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/)
- [Pino vs Winston](https://betterstack.com/community/comparisons/pino-vs-winston/)

### JWT Security
- [JWT Best Practices 2025](https://jwt.app/blog/jwt-best-practices/)
- [RS256 vs HS256](https://supertokens.com/blog/rs256-vs-hs256)
