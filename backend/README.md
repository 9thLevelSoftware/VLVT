# VLVT Backend

The backend consists of three microservices that handle different aspects of the dating app functionality.

## Services

| Service | Port | Description |
|---------|------|-------------|
| auth-service | 3001 | Authentication, user management, JWT tokens |
| profile-service | 3002 | User profiles, discovery, photo management |
| chat-service | 3003 | Messaging, matches, real-time via Socket.io |

## Local Development

### Using Docker (Recommended)

Start all services with PostgreSQL:

```bash
# From project root
cp .env.example .env  # Configure environment variables
docker-compose up --build
```

### Running Individual Services

Each service can be run independently:

```bash
# Auth service
cd backend/auth-service
npm install
npm run dev

# Profile service
cd backend/profile-service
npm install
npm run dev

# Chat service
cd backend/chat-service
npm install
npm run dev
```

## Deployment

Each service is deployed independently to Railway.

### Railway Deployment

```bash
# Deploy auth-service
cd backend/auth-service
railway login
railway link
railway up

# Deploy profile-service
cd backend/profile-service
railway link
railway up

# Deploy chat-service
cd backend/chat-service
railway link
railway up
```

### Required Environment Variables

**All services require:**

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NODE_ENV` | Set to `production` for deployment |
| `PORT` | Service-specific port (3001/3002/3003) |

**auth-service additionally requires:**

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for JWT signing |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `APPLE_CLIENT_ID` | Apple Sign-In client ID |
| `REVENUECAT_WEBHOOK_AUTH` | RevenueCat webhook secret |
| `KYCAID_ENCRYPTION_KEY` | KYCAID PII encryption key |

**profile-service additionally requires:**

| Variable | Description |
|----------|-------------|
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |

**chat-service additionally requires:**

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK credentials (JSON) |

## Database

### Running Migrations

```bash
cd backend/migrations
npm install
npm run migrate
```

### Seeding Test Data

```bash
cd backend/seed-data
npm install
npm run seed         # Add test users
npm run seed:fresh   # Clean and re-seed
npm run clean        # Remove test data
```

## Testing

Each service has its own test suite:

```bash
cd backend/<service-name>
npm test             # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage
```

## Architecture Notes

- All services use Express.js with TypeScript
- PostgreSQL for data persistence (shared database)
- Winston for structured logging
- Helmet for security headers
- Rate limiting on all endpoints
- JWT-based authentication (tokens issued by auth-service)
