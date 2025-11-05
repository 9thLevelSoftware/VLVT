# NoBS Dating - Implementation Details

## Overview
This document provides detailed information about the implementation of the NoBS Dating app, including architecture decisions, technologies used, and how different components interact.

## Architecture

### Backend Architecture (Microservices)

The backend is built using a microservices architecture with three independent services:

#### 1. Auth Service (Port 3001)
- **Purpose**: Handles user authentication
- **Technology**: Node.js, TypeScript, Express
- **Authentication Methods**:
  - Sign in with Apple (passwordless)
  - Sign in with Google (passwordless)
- **JWT Token Management**:
  - Generates JWT tokens with 7-day expiration
  - Tokens contain userId, provider, and email
  - Uses HS256 algorithm for signing
- **Endpoints**:
  - `POST /auth/apple`: Accepts Apple identity token
  - `POST /auth/google`: Accepts Google ID token
  - `POST /auth/verify`: Verifies JWT token validity

**Note**: Current implementation is stubbed for demonstration. In production, you must:
- Verify Apple identity tokens using Apple's public keys
- Verify Google ID tokens using Google's token verification API
- Use strong, random JWT secrets stored securely

#### 2. Profile Service (Port 3002)
- **Purpose**: Manages user profiles
- **Technology**: Node.js, TypeScript, Express
- **Storage**: In-memory Map (stub implementation)
- **Operations**: Full CRUD (Create, Read, Update, Delete)
- **Profile Fields**:
  - userId (required)
  - name
  - age
  - bio
  - photos (array of URLs)
  - interests (array of strings)
- **Endpoints**:
  - `POST /profile`: Create or update profile
  - `GET /profile/:userId`: Get profile by ID
  - `PUT /profile/:userId`: Update profile
  - `DELETE /profile/:userId`: Delete profile
  - `GET /profiles/discover`: Get random profiles for discovery

**Note**: Replace in-memory storage with PostgreSQL queries in production.

#### 3. Chat Service (Port 3003)
- **Purpose**: Handles matches and messaging
- **Technology**: Node.js, TypeScript, Express
- **Storage**: In-memory arrays (stub implementation)
- **Features**:
  - Match management
  - Message exchange
- **Endpoints**:
  - `GET /matches/:userId`: Get all matches for a user
  - `POST /matches`: Create a new match
  - `GET /messages/:matchId`: Get all messages for a match
  - `POST /messages`: Send a message

**Note**: Replace with PostgreSQL queries and add real-time WebSocket support in production.

### Database Schema

PostgreSQL database with four main tables:

1. **users**: Stores authentication info (id, provider, email)
2. **profiles**: Stores profile data (user_id, name, age, bio, photos, interests)
3. **matches**: Stores match relationships between users
4. **messages**: Stores chat messages

See `database/init.sql` for complete schema.

### Frontend Architecture (Flutter)

#### State Management
- **Provider pattern** for state management
- Two main providers:
  - `AuthService`: Manages authentication state
  - `SubscriptionService`: Manages subscription state

#### Authentication Flow
1. User opens app → sees `AuthScreen`
2. User taps "Sign in with Apple/Google"
3. Native SDK handles authentication
4. App sends identity token to backend
5. Backend returns JWT token
6. Token stored in secure storage
7. App navigates to `MainScreen`

#### Subscription Gating Flow
1. After authentication, app checks RevenueCat entitlement
2. RevenueCat SDK checks for "premium_access" entitlement
3. If entitlement is **active**:
   - User sees 3-tab interface (Discovery, Matches, Profile)
   - All features are accessible
4. If entitlement is **inactive**:
   - User sees `PaywallScreen`
   - Discovery and Matches tabs are blocked
   - Only Profile tab accessible (to sign out)
5. User can purchase subscription via paywall
6. After purchase, entitlement updates automatically
7. App unlocks all features

#### Screens

##### 1. AuthScreen
- Sign in with Apple button (iOS only)
- Sign in with Google button
- Handles authentication errors

##### 2. MainScreen
- Container for 3 tabs
- Checks subscription status
- Shows paywall if no premium access
- Bottom navigation bar

##### 3. PaywallScreen
- Shows premium benefits
- "Subscribe Now" button
- "Restore Purchases" button
- Sign out option

##### 4. DiscoveryScreen
- Stub profile cards
- Like/Pass buttons
- Swipe functionality (simplified)

##### 5. MatchesScreen
- List of matches
- Last message preview
- Tap to open chat (stub)

##### 6. ProfileScreen
- User information
- Subscription status indicator
- Edit profile button (stub)
- Sign out button

### Security Considerations

#### Current Implementation (Development/Demo)
- Stub token verification (NOT PRODUCTION READY)
- Default JWT secret (MUST CHANGE IN PRODUCTION)
- In-memory data storage (data lost on restart)
- No rate limiting
- No input validation/sanitization

#### Production Requirements
1. **Authentication**:
   - Verify Apple identity tokens with Apple's public keys
   - Verify Google ID tokens with Google's verification API
   - Use cryptographically secure JWT secrets
   - Implement token refresh mechanism

2. **API Security**:
   - Add authentication middleware to all protected routes
   - Implement rate limiting
   - Use HTTPS for all communications
   - Validate and sanitize all inputs
   - Implement CORS properly

3. **Database**:
   - Use parameterized queries (prevent SQL injection)
   - Implement proper access controls
   - Use strong passwords
   - Enable SSL connections
   - Regular backups

4. **Secrets Management**:
   - Never commit secrets to version control
   - Use environment variables
   - Use secret management tools (AWS Secrets Manager, HashiCorp Vault)

### RevenueCat Integration

#### Configuration Required
1. Create account at [revenuecat.com](https://www.revenuecat.com)
2. Create a new project
3. Configure products in RevenueCat dashboard
4. Create "premium_access" entitlement
5. Link entitlement to products
6. Get API keys (separate for iOS and Android)
7. Update `subscription_service.dart` with actual API key

#### Entitlement Check
```dart
final customerInfo = await Purchases.getCustomerInfo();
final hasPremium = customerInfo.entitlements.all['premium_access']?.isActive ?? false;
```

#### Purchase Flow
```dart
final offerings = await Purchases.getOfferings();
final package = offerings.current!.availablePackages.first;
await Purchases.purchasePackage(package);
```

### Docker Configuration

#### Services
- **postgres**: PostgreSQL 15 Alpine
- **auth-service**: Node.js auth microservice
- **profile-service**: Node.js profile microservice
- **chat-service**: Node.js chat microservice

#### Networking
All services can communicate via service names:
- `postgres:5432`
- `auth-service:3001`
- `profile-service:3002`
- `chat-service:3003`

#### Volumes
- `postgres_data`: Persists database data
- `./database/init.sql`: Database initialization script

### Testing

#### Backend Testing
Each service has been tested individually:
- ✓ Health endpoints working
- ✓ Authentication endpoints returning valid JWTs
- ✓ Profile CRUD operations working
- ✓ Match and message creation working
- ✓ TypeScript compilation successful
- ✓ No dependency vulnerabilities

#### Frontend Testing
Manual testing required (Flutter not installed in environment):
- Compile check: Would need `flutter analyze`
- Runtime testing: Would need `flutter run`
- Widget tests: Would need `flutter test`

### Future Enhancements

1. **Backend**:
   - Replace in-memory storage with actual PostgreSQL queries
   - Add real-time WebSocket support for chat
   - Implement proper token verification
   - Add API gateway for routing
   - Implement caching (Redis)
   - Add logging and monitoring

2. **Frontend**:
   - Add profile editing functionality
   - Implement real chat interface
   - Add photo upload functionality
   - Implement swipe animations
   - Add push notifications
   - Add user preferences/filters
   - Implement profile discovery algorithm

3. **DevOps**:
   - Add CI/CD pipeline
   - Add automated testing
   - Deploy to cloud (AWS, GCP, Azure)
   - Add monitoring (Prometheus, Grafana)
   - Add logging aggregation (ELK stack)
   - Implement blue-green deployments

4. **Security**:
   - Add API authentication middleware
   - Implement rate limiting
   - Add CSRF protection
   - Implement content security policy
   - Add security headers
   - Regular security audits

## Development Workflow

### Running Backend Locally
```bash
# Option 1: Using Docker Compose (recommended)
./start-backend.sh

# Option 2: Running services individually
cd backend/auth-service && npm run dev
cd backend/profile-service && npm run dev
cd backend/chat-service && npm run dev
```

### Running Frontend Locally
```bash
cd frontend
flutter pub get
flutter run
```

### Building for Production
```bash
# Backend
cd backend/<service-name>
npm run build

# Frontend
cd frontend
flutter build ios
flutter build apk
```

## Conclusion

This implementation provides a solid foundation for a dating app with:
- ✓ Passwordless authentication
- ✓ Subscription-based access control
- ✓ Microservices architecture
- ✓ Docker containerization
- ✓ Clean, maintainable code structure

The stub implementations can be replaced with full functionality as needed, following the patterns established in this codebase.
