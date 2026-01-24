# Phase 1: Security Hardening - Research

**Researched:** 2026-01-24
**Domain:** Node.js/Express security, PostgreSQL TLS, input validation, rate limiting, dependency management
**Confidence:** HIGH

## Summary

This research addresses Phase 1: Security Hardening requirements (SEC-01 through SEC-09) for the VLVT dating app backend. The existing codebase already has solid security foundations including Helmet.js, rate limiting, input validation middleware, and PII redaction in logs. However, several gaps exist that must be addressed for production readiness.

The key findings are:
1. **TLS Validation (SEC-01):** All three services use `rejectUnauthorized: false` for Railway PostgreSQL connections. Railway uses self-signed certificates and does not provide a CA bundle, making full TLS validation challenging. The recommended path forward is to document this limitation, ensure DATABASE_URL uses TLS, and use Railway's internal networking where possible.

2. **Encryption at Rest (SEC-02):** KYCAID PII encryption is already implemented with `KYCAID_ENCRYPTION_KEY`. The encryption key is enforced at runtime. Location data is fuzzed but not encrypted. Exact locations should be evaluated for encryption-at-rest needs.

3. **Dependencies (SEC-03):** npm audit shows 8-9 vulnerabilities per service, including 2-3 high severity (jws, qs, glob). All are fixable with `npm audit fix`.

4. **BOLA/IDOR (SEC-04):** The codebase has excellent authorization patterns already in place - each endpoint verifies user ownership before data access.

5. **Rate Limiting (SEC-05):** Auth endpoints have dedicated `authLimiter` (10 requests/15 min). Redis-backed for production.

6. **Socket.IO Adapter (SEC-09):** The deprecated `socket.io-redis` package must be migrated to `@socket.io/redis-adapter`.

**Primary recommendation:** Focus on dependency updates (SEC-03) and Socket.IO adapter migration (SEC-09) as they are straightforward fixes. TLS validation (SEC-01) requires documentation and acceptance of Railway's limitations. PII scrubbing (SEC-07) needs audit of logging statements for location/message content leaks.

## Standard Stack

The established libraries/tools for security hardening:

### Core (Already in Codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| helmet | ^8.1.0 | HTTP security headers | Industry standard, enables HSTS, CSP, etc. |
| express-rate-limit | ^7.5.0 - ^8.2.1 | Rate limiting | Per-IP and per-user limits, Redis-backed for production |
| rate-limit-redis | ^4.2.3 | Redis store for rate limiter | Enables distributed rate limiting |
| express-validator | ^7.3.0 | Input validation | Declarative validation chains |
| winston | ^3.18.3 | Logging | Supports custom redaction formatters |
| @sentry/node | ^10.25.0 | Error tracking | Production error monitoring |
| pg | ^8.16.3 | PostgreSQL client | Native SSL/TLS support |
| jsonwebtoken | ^9.0.2 | JWT handling | Auth token generation/verification |
| bcrypt | ^6.0.0 | Password hashing | Industry standard work factor hashing |

### Updates Required
| Library | Current | Target | Purpose |
|---------|---------|--------|---------|
| socket.io-redis | ^6.1.1 | REMOVE | Deprecated - replace with @socket.io/redis-adapter |
| @socket.io/redis-adapter | N/A | ^8.3.0 | Modern Redis adapter for Socket.IO |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (Node.js builtin) | N/A | AES-256 encryption | Field-level encryption for PII |
| pgcrypto (PostgreSQL) | N/A | Database encryption | Already used for KYCAID PII |

**Installation (for SEC-09):**
```bash
cd backend/chat-service
npm uninstall socket.io-redis
npm install @socket.io/redis-adapter@^8.3.0
```

## Architecture Patterns

### Recommended Project Structure
```
backend/shared/src/
├── middleware/
│   ├── auth.ts               # JWT authentication
│   ├── rate-limiter.ts       # Rate limiting configurations
│   └── request-signing.ts    # HMAC request integrity
├── utils/
│   ├── logger.ts             # PII-redacting Winston logger
│   ├── audit-logger.ts       # Security event logging
│   └── env-validator.ts      # Environment validation
└── errors/
    └── error-codes.ts        # Standardized error responses

backend/*/src/
├── index.ts                  # Service entry with security middleware
├── middleware/
│   ├── auth.ts               # Service-specific auth middleware
│   ├── rate-limiter.ts       # Service-specific rate limits
│   └── validation.ts         # Input validation schemas
└── utils/
    ├── input-validation.ts   # Custom validation utilities
    └── crypto.ts             # Token generation, timing-safe comparison
```

### Pattern 1: TLS Database Connection with Railway
**What:** Configure PostgreSQL TLS for Railway's self-signed certificates
**When to use:** All production database connections
**Current Reality:** Railway uses self-signed certificates and does not provide CA bundle

```typescript
// Source: Current codebase pattern - documented limitation
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }  // Railway self-signed certs
    : false,
});

// SECURITY NOTE: Railway PostgreSQL uses internal TLS with self-signed certs.
// Full certificate validation (rejectUnauthorized: true) is not possible without
// a CA bundle from Railway, which they do not currently provide.
//
// Mitigations:
// 1. DATABASE_URL uses TLS (postgresql://...?sslmode=require)
// 2. Internal networking used where possible (Railway private networking)
// 3. Railway handles certificate rotation automatically
// 4. Document this as a known limitation
```

### Pattern 2: Rate Limiting for Auth Endpoints
**What:** Stricter rate limits on authentication to prevent brute force
**When to use:** Login, token refresh, password reset endpoints
**Example:**
```typescript
// Source: backend/auth-service/src/middleware/rate-limiter.ts
// Authentication rate limiter (10 requests per 15 minutes per IP)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore, // Redis store in production
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limiter: 'auth'
    });
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later'
    });
  }
});
```

### Pattern 3: BOLA/IDOR Prevention
**What:** Verify user owns the resource before data access
**When to use:** Every endpoint that accesses user-specific data
**Example:**
```typescript
// Source: backend/chat-service/src/index.ts:271-283
// CORRECT: Verify authenticated user matches requested userId
app.get('/matches/:userId', authMiddleware, async (req: Request, res: Response) => {
  const requestedUserId = req.params.userId;
  const authenticatedUserId = req.user!.userId;

  // Authorization check: user can only view their own matches
  if (requestedUserId !== authenticatedUserId) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Cannot access other users\' matches'
    });
  }
  // ... proceed with query
});
```

### Pattern 4: PII Redaction in Logs
**What:** Automatically scrub sensitive data from log output
**When to use:** All logging throughout the application
**Example:**
```typescript
// Source: backend/shared/src/utils/logger.ts

// Current SENSITIVE_FIELDS list
const SENSITIVE_FIELDS = [
  'token', 'idToken', 'identityToken', 'authorization',
  'accessToken', 'refreshToken', 'tempToken', 'resetToken',
  'verificationToken', 'password', 'passwordHash', 'password_hash',
  'newPassword', 'currentPassword', 'secret', 'apiKey', 'api_key',
  'bearer', 'jwt', 'code', 'clientSecret', 'client_secret',
  'privateKey', 'private_key', 'creditCard', 'ssn',
];

// MISSING (SEC-07): Add location and message content fields
// TODO: Add these fields for SEC-07 compliance:
// 'latitude', 'longitude', 'lat', 'lng', 'location',
// 'text', 'messageText', 'content', 'body.text'
```

### Pattern 5: Socket.IO Redis Adapter Migration
**What:** Replace deprecated socket.io-redis with @socket.io/redis-adapter
**When to use:** Socket.IO horizontal scaling with Redis
**Example:**
```typescript
// BEFORE (deprecated):
// import redisAdapter from 'socket.io-redis';
// io.adapter(redisAdapter({ host: 'localhost', port: 6379 }));

// AFTER (modern):
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

### Anti-Patterns to Avoid
- **Skipping authorization checks:** Never assume endpoint is secure because URL is hard to guess
- **Logging raw coordinates:** Always redact/fuzz before logging location data
- **Logging message content:** Never log actual chat messages in production
- **Hardcoded secrets:** Use environment variables exclusively, fail at startup if missing
- **Regex-only input validation:** Pattern matching is secondary to parameterized queries
- **Ignoring npm audit:** High/critical vulnerabilities must be addressed before production

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting | Custom middleware counters | express-rate-limit + rate-limit-redis | Handles edge cases, Redis-backed for distribution |
| Input validation | Custom regex matchers | express-validator | Declarative, chainable, handles sanitization |
| Password hashing | MD5/SHA256 | bcrypt | Work factor, salting, timing-safe comparison |
| HTTP security headers | Manual header setting | Helmet.js | Comprehensive, updated for new threats |
| Token generation | Math.random() | crypto.randomBytes() | Cryptographically secure |
| String comparison for secrets | === operator | crypto.timingSafeEqual() | Prevents timing attacks |
| SQL injection prevention | String escaping | Parameterized queries (pg) | Database driver handles escaping |

**Key insight:** The codebase already uses all the right patterns. Focus is on auditing completeness, not introducing new patterns.

## Common Pitfalls

### Pitfall 1: Railway PostgreSQL TLS Certificate
**What goes wrong:** `rejectUnauthorized: true` fails with "self-signed certificate in certificate chain"
**Why it happens:** Railway uses self-signed internal certificates, doesn't provide CA bundle
**How to avoid:**
- Accept `rejectUnauthorized: false` as documented limitation
- Use Railway internal networking (private URLs)
- Document in security policy
**Warning signs:** SSL connection errors in logs, fallback to unencrypted connections
**Reference:** [Railway Help Station](https://station.railway.com/questions/postgre-sql-ssl-connection-self-signed-33f0d3b6)

### Pitfall 2: npm audit Fix Breaking Changes
**What goes wrong:** `npm audit fix` upgrades dependencies to incompatible major versions
**Why it happens:** Some vulnerabilities require major version bumps
**How to avoid:**
- Use `npm audit fix --dry-run` first
- Review each change, test thoroughly
- Use `npm audit fix --force` only with full test suite
**Warning signs:** Type errors, runtime failures after npm audit fix

### Pitfall 3: Rate Limiter Memory Leak
**What goes wrong:** Memory-based rate limiter causes OOM in multi-instance deployment
**Why it happens:** Each instance has separate counters, can't enforce global limits
**How to avoid:** Always use Redis store in production (already configured)
**Warning signs:** Rate limits not enforced, memory growth over time

### Pitfall 4: PII in Error Stack Traces
**What goes wrong:** Sensitive data appears in error.message or stack
**Why it happens:** Error includes request body or user data in message
**How to avoid:** Wrap errors, don't include raw user input in error messages
**Warning signs:** PII visible in Sentry, log files contain emails/tokens

### Pitfall 5: Socket.IO Adapter Protocol Compatibility
**What goes wrong:** Dropped messages during Socket.IO adapter migration
**Why it happens:** Old and new adapters running simultaneously with protocol changes
**How to avoid:** @socket.io/redis-adapter is protocol-compatible with socket.io-redis
**Warning signs:** None - migration is safe for gradual rollout
**Reference:** [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)

## Code Examples

Verified patterns from existing codebase:

### Input Validation Middleware
```typescript
// Source: backend/auth-service/src/utils/input-validation.ts

// SQL injection pattern detection
const SQL_INJECTION_PATTERNS = [
  /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT( +INTO)?|MERGE|SELECT|UPDATE|UNION( +ALL)?)\b)/i,
  /(\b(OR\b|AND\b)[\s]*[0-9]+[\s]*=[\s]*[0-9]+)/i,
  // ... more patterns
];

// XSS pattern detection
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
  /<[^>]+on\w+\s*=/i,
  // ... more patterns
];

// Express middleware applying validation
export function validateInputMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.query && Object.keys(req.query).length > 0) {
      req.query = validateAndSanitizeObject(req.query, 'query');
    }
    if (req.body && Object.keys(req.body).length > 0) {
      req.body = validateAndSanitizeObject(req.body, 'body');
    }
    if (req.params && Object.keys(req.params).length > 0) {
      req.params = validateAndSanitizeObject(req.params, 'params');
    }
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid input data',
      code: 'VALIDATION_ERROR'
    });
  }
}
```

### Timing-Safe Token Verification
```typescript
// Source: backend/auth-service/src/utils/crypto.ts

export function verifyToken(token: string, storedHash: string): boolean {
  try {
    const computedHash = hashToken(token);
    // Both hashes should be 64-char hex strings
    if (computedHash.length !== storedHash.length || storedHash.length !== 64) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}
```

### Encryption Key Enforcement
```typescript
// Source: backend/auth-service/src/index.ts:2499-2507

// Security: Require encryption key for PII storage - fail closed
const encryptionKey = process.env.KYCAID_ENCRYPTION_KEY;
if (!encryptionKey) {
  logger.error('KYCAID_ENCRYPTION_KEY not set - cannot store PII securely');
  return res.status(503).json({
    success: false,
    error: 'KYC service not properly configured for encryption'
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| socket.io-redis | @socket.io/redis-adapter | v7 (2021) | Package rename, same protocol, no breaking changes |
| Express 4.x | Express 5.x | 2024 | Async route handler support, better error handling |
| Manual HSTS | Helmet.js HSTS with preload | 2023+ | Required for browser HSTS preload lists |
| Implicit TLS rejection | Explicit rejectUnauthorized | node-postgres 8.0 | Warning deprecation, explicit opt-in required |

**Deprecated/outdated:**
- `socket.io-redis`: Renamed to `@socket.io/redis-adapter`, use new package
- Implicit `rejectUnauthorized`: pg 8.0 will require explicit setting
- X-RateLimit headers: Replaced by standardHeaders (RateLimit-* headers)

## Open Questions

Things that couldn't be fully resolved:

1. **Railway TLS CA Bundle**
   - What we know: Railway uses self-signed certs for PostgreSQL
   - What's unclear: Whether Railway will ever provide CA bundle for `rejectUnauthorized: true`
   - Recommendation: Accept limitation, document in security policy, use internal networking

2. **Location Encryption at Rest**
   - What we know: Exact locations stored for After Hours sessions (`latitude`, `longitude`)
   - What's unclear: Whether these require encryption-at-rest like KYCAID PII
   - Recommendation: Fuzzed locations are displayed; exact locations may warrant encryption for high-security compliance

3. **Message Content in Logs**
   - What we know: Some debug logs may include message text
   - What's unclear: Full audit of logging statements needed
   - Recommendation: Audit all logger calls, add 'text' and 'content' to SENSITIVE_FIELDS

## Sources

### Primary (HIGH confidence)
- **VLVT Codebase Analysis:** All security patterns verified against actual implementation
- [node-postgres SSL Documentation](https://node-postgres.com/features/ssl) - Official SSL configuration
- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) - Official migration guide
- [@socket.io/redis-adapter npm](https://www.npmjs.com/package/@socket.io/redis-adapter) - Package details

### Secondary (MEDIUM confidence)
- [Railway PostgreSQL SSL Help](https://station.railway.com/questions/postgre-sql-ssl-connection-self-signed-33f0d3b6) - Community guidance on Railway TLS
- [express-validator Documentation](https://express-validator.github.io/docs/) - Input validation patterns
- [Express Security Best Practices 2025](https://hub.corgea.com/articles/express-security-best-practices-2025) - Industry guidelines

### Tertiary (LOW confidence)
- npm audit output - Point-in-time snapshot, vulnerabilities change frequently

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in codebase, versions verified
- Architecture patterns: HIGH - Patterns extracted directly from working code
- Pitfalls: HIGH - Railway TLS issue verified against community reports
- Dependencies: MEDIUM - npm audit output is ephemeral, run fresh before implementation

**Research date:** 2026-01-24
**Valid until:** 2026-02-07 (14 days - fast-moving dependency vulnerabilities)

## Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| SEC-01: TLS validation | DOCUMENTED | Railway limitation requires `rejectUnauthorized: false` |
| SEC-02: Encryption keys enforced | IMPLEMENTED | `KYCAID_ENCRYPTION_KEY` required at runtime |
| SEC-03: Dependency audit | ACTION NEEDED | 8-9 vulnerabilities per service, fixable |
| SEC-04: BOLA/IDOR check | IMPLEMENTED | All endpoints verify user ownership |
| SEC-05: Auth rate limiting | IMPLEMENTED | `authLimiter` with Redis store |
| SEC-06: No hardcoded secrets | AUDIT NEEDED | `DEFAULT_DEV_SECRET` in request-signing.ts (dev only) |
| SEC-07: PII scrubbed from logs | PARTIAL | Emails redacted, locations/messages need audit |
| SEC-08: Input validation | IMPLEMENTED | Comprehensive middleware in place |
| SEC-09: Socket.IO adapter upgrade | ACTION NEEDED | Replace socket.io-redis with @socket.io/redis-adapter |
