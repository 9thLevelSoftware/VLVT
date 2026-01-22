# Technology Stack: VLVT Hookup Mode

**Project:** VLVT Dating App - Hookup Mode Feature
**Researched:** 2026-01-22
**Overall Confidence:** HIGH

## Executive Summary

This document recommends the additional libraries, services, and infrastructure needed to implement proximity-based hookup mode in VLVT. The existing stack (Flutter + Node.js/Express + Socket.IO + PostgreSQL + Redis) provides a solid foundation. The recommendations focus on four areas: real-time proximity matching, ephemeral chat sessions, session management for timed hookup mode, and location fuzzing for privacy.

---

## Recommended Stack Additions

### 1. Geospatial Queries at Scale

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **PostGIS** | 3.6.x | PostgreSQL geospatial extension | Precise distance calculations, spatial indexing, future-proof for complex geo features | HIGH |
| **Redis GEOADD/GEOSEARCH** | (existing redis ^4.7.1) | Real-time proximity cache | O(log N) performance, sub-millisecond proximity queries, already in stack | HIGH |

**Rationale:**

The current system stores latitude/longitude as DECIMAL columns with B-tree indexes. This works for basic discovery but won't scale for real-time proximity matching where:
- Users need sub-second location updates
- Queries must find all users within X km efficiently
- Edge cases (users near geohash boundaries) must be handled

**Dual-layer approach:**
1. **Redis Geo** (hot path): Real-time proximity queries for active hookup mode users. Use GEOADD to store active user locations, GEOSEARCH to find nearby users. Sub-millisecond queries, handles 1000s of users per geohash cell.

2. **PostGIS** (cold path + persistence): Store location history, complex spatial queries, geofencing for future features. The existing comment in migration 004 already recommends PostGIS for production.

**Why NOT earthdistance extension:**
- earthdistance assumes spherical Earth (less accurate)
- No spatial indexing (sequential scans)
- Distance units hardcoded to statute miles
- PostGIS is only slightly slower but far more capable
- PostGIS geography type handles edge cases automatically

Sources:
- [PostGIS vs earthdistance comparison](https://elephanttamer.net/?p=11)
- [Redis geospatial documentation](https://redis.io/docs/latest/develop/data-types/geospatial/)
- [Hashrocket earthdistance vs PostGIS](https://hashrocket.com/blog/posts/juxtaposing-earthdistance-and-postgis)

---

### 2. Ephemeral/Time-Boxed Chat Sessions

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **BullMQ** | ^5.66.x | Job scheduling for session expiry | Modern, maintained, Redis-backed, supports delayed jobs | HIGH |
| **pg_cron** | 1.6.x | PostgreSQL scheduled cleanup | Simple, battle-tested for batch deletes | MEDIUM |

**Rationale:**

Ephemeral chat requires:
1. **Session start** - Create timed session with fixed duration
2. **Auto-expire** - End session and delete messages unless both users save
3. **Cleanup** - Remove expired data efficiently

**Recommended approach:**

```
Session Creation:
1. Create hookup_sessions row with expires_at timestamp
2. Add BullMQ delayed job for session expiry notification
3. Store messages in hookup_messages with session_id FK

Session Expiry:
1. BullMQ worker fires at expires_at
2. Check if both users marked "save"
3. If no save: DELETE messages, mark session expired
4. If save: Convert to permanent match/chat
```

**Why BullMQ over alternatives:**
- **vs node-cron**: node-cron is in-memory only, jobs lost on restart. Hookup sessions MUST survive restarts.
- **vs Agenda**: Last major release Nov 2022, effectively unmaintained
- **vs Bull**: Bull is in maintenance mode, BullMQ is the active successor
- BullMQ's Job Schedulers (v5.16+) provide robust repeatable/delayed job management

**Why pg_cron for cleanup:**
- Batch deletion of expired sessions/messages
- Runs directly in PostgreSQL, no external service
- Efficient with PostgreSQL 17's improved vacuum performance
- Use for nightly cleanup of any orphaned data

Sources:
- [BullMQ documentation](https://docs.bullmq.io)
- [BullMQ delayed jobs](https://docs.bullmq.io/guide/jobs/delayed)
- [Better Stack BullMQ guide](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/)
- [Node.js scheduler comparison](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/)
- [pg_cron for PostgreSQL](https://schinckel.net/2021/09/09/automatically-expire-rows-in-postgres/)

---

### 3. Session Management for Timed Hookup Mode

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Redis TTL** | (existing) | Active session state | Native TTL, atomic operations, sliding expiration | HIGH |
| **Socket.IO Rooms** | (existing ^4.7.2) | Real-time session channels | Dynamic room management, already in stack | HIGH |
| **@socket.io/redis-adapter** | ^8.3.x | Horizontal scaling for rooms | Modern replacement for socket.io-redis, sharded pub/sub | HIGH |

**Rationale:**

Timed hookup sessions need:
1. **Active state tracking**: Who is in hookup mode right now
2. **Session channels**: Real-time communication between matched users
3. **Timer management**: Countdown, warnings, expiration

**Session state in Redis:**

```javascript
// User enters hookup mode
await redis.setex(`hookup:active:${userId}`, 3600, JSON.stringify({
  startedAt: Date.now(),
  preferences: { maxDistance: 5, ageRange: [25, 35] },
  location: { lat: 34.0522, lng: -118.2437 }
}));

// Also add to geo index
await redis.geoAdd('hookup:locations', {
  longitude: -118.2437,
  latitude: 34.0522,
  member: userId
});

// Find nearby users
const nearby = await redis.geoSearch('hookup:locations', {
  longitude: userLng,
  latitude: userLat,
  radius: 5,
  unit: 'km'
});
```

**Socket.IO room structure:**

```javascript
// When match created, both users join session room
socket.join(`hookup:session:${sessionId}`);

// Emit to session participants only
io.to(`hookup:session:${sessionId}`).emit('message', data);
io.to(`hookup:session:${sessionId}`).emit('timer:update', { remaining: 1800 });
io.to(`hookup:session:${sessionId}`).emit('session:expiring', { warning: '5min' });
```

**IMPORTANT - Upgrade socket.io-redis:**

The current codebase uses `socket.io-redis: ^6.1.1` which is deprecated. Upgrade to `@socket.io/redis-adapter: ^8.3.x`:
- Package renamed in v7 to match Redis emitter naming
- Supports Redis 7.0 sharded Pub/Sub for better performance
- Active maintenance vs deprecated package

Sources:
- [Redis TTL best practices](https://devops.aibit.im/article/best-practices-redis-expire-ttl)
- [Socket.IO Redis adapter](https://socket.io/docs/v4/redis-adapter/)
- [Scaling Socket.IO with Redis](https://medium.com/@connect.hashblock/scaling-socket-io-redis-adapters-and-namespace-partitioning-for-100k-connections-afd01c6938e7)
- [Socket.IO rooms documentation](https://socket.io/docs/v3/rooms/)

---

### 4. Location Fuzzing for Privacy

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Geohash truncation** | Custom implementation | Location obfuscation | Simple, effective, configurable precision | HIGH |
| **Random offset** | Custom implementation | Additional noise | Prevents trilateration attacks | HIGH |

**Rationale:**

Dating apps have been exploited via trilateration - attackers use precise distances from multiple points to pinpoint exact locations. Hookup mode increases this risk because:
- Users share location more frequently
- Real-time updates provide more data points
- Proximity queries reveal relative positions

**Recommended approach:**

```typescript
// Location fuzzing utility
interface FuzzedLocation {
  lat: number;
  lng: number;
  precision: 'exact' | 'neighborhood' | 'area';
}

function fuzzLocation(lat: number, lng: number, precisionMeters: number): FuzzedLocation {
  // 1. Truncate to geohash precision
  // geohash length 6 = ~1.2km x 0.6km rectangle
  // geohash length 5 = ~5km x 5km rectangle

  // 2. Add random offset within precision bounds
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * precisionMeters;

  const latOffset = (distance / 111320) * Math.cos(angle); // 111320m per degree lat
  const lngOffset = (distance / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);

  return {
    lat: lat + latOffset,
    lng: lng + lngOffset,
    precision: precisionMeters <= 100 ? 'neighborhood' : 'area'
  };
}

// Configuration per feature
const FUZZING_CONFIG = {
  hookupDiscovery: 500,    // 500m fuzzing for "nearby" display
  hookupMatching: 100,     // 100m for matching algorithm (need reasonable accuracy)
  profileDisplay: 1000,    // 1km for showing distance on profiles
};
```

**Privacy layers:**

1. **Storage**: Store exact coordinates encrypted, fuzzed coordinates in clear
2. **Display**: Never show exact distance (use "< 1 km", "1-2 km" bands)
3. **Matching**: Use fuzzed coordinates for matching, re-verify with slightly less fuzzing for final match
4. **Rate limiting**: Limit location update frequency to prevent tracking

**What NOT to do:**
- Don't show distances in feet/meters (enables trilateration)
- Don't update location on every GPS change (enables tracking)
- Don't store location history without encryption

Sources:
- [Dating app privacy risks](https://www.penligent.ai/hackinglabs/dating-apps-privacy-risks-and-how-ai-powered-penetration-tools-can-help/)
- [Trilateration attacks on dating apps](https://research.checkpoint.com/2024/the-illusion-of-privacy-geolocation-risks-in-modern-dating-apps/)
- [Location obfuscation techniques](https://www.researchgate.net/publication/224516626_An_Obfuscation-Based_Approach_for_Protecting_Location_Privacy)

---

### 5. Flutter Frontend Additions

| Package | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| **flutter_foreground_task** | ^8.x | Background location for active hookup mode | Reliable foreground service, survives app minimize | HIGH |
| **geolocator** | ^14.0.2 | (existing) Location services | Already in stack, well-maintained | HIGH |

**Rationale:**

When user is in active hookup mode, the app needs to:
1. Track location even when minimized
2. Show persistent notification (required by Android 14+)
3. Send location updates to server
4. Receive match notifications in real-time

**Why flutter_foreground_task:**
- Designed specifically for foreground services
- Works with geolocator (already in stack)
- Handles Android 14+ restrictions properly
- Shows required persistent notification
- Runs in separate isolate, survives app lifecycle

**Why NOT workmanager:**
- WorkManager is for periodic/deferrable tasks
- OS controls exact execution timing
- Not suitable for continuous real-time tracking
- Would miss proximity matches

**Implementation pattern:**

```dart
// Start hookup mode
await FlutterForegroundTask.init(
  androidNotificationOptions: AndroidNotificationOptions(
    channelId: 'hookup_mode',
    channelName: 'Hookup Mode Active',
    channelDescription: 'Location tracking for nearby matches',
  ),
  foregroundTaskOptions: ForegroundTaskOptions(
    interval: 30000, // 30 second location updates
    isOnceEvent: false,
    autoRunOnBoot: false,
  ),
);

// In foreground task callback
void onLocation(Position position) {
  // Send to server via existing socket connection
  socketService.emit('hookup:location', {
    'lat': position.latitude,
    'lng': position.longitude,
  });
}
```

**Required permissions (add to existing):**

Android (AndroidManifest.xml):
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

Sources:
- [flutter_foreground_task package](https://pub.dev/packages/flutter_foreground_task)
- [Background location tracking guide](https://medium.com/@naveenkumarkompelly99/flutter-background-location-tracking-using-flutter-foreground-task-and-geolocator-38fc68c03bd8)
- [Android 14 background restrictions](https://medium.com/@shubhampawar99/handling-background-services-in-flutter-the-right-way-across-android-14-ios-17-b735f3b48af5)

---

## Database Schema Additions

**New tables needed:**

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Hookup sessions
CREATE TABLE hookup_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_a_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  user_b_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active', -- active, expired, saved, cancelled
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  user_a_saved BOOLEAN DEFAULT FALSE,
  user_b_saved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Hookup messages (ephemeral)
CREATE TABLE hookup_messages (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) REFERENCES hookup_sessions(id) ON DELETE CASCADE,
  sender_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add PostGIS geography column to profiles (optional, for complex queries)
ALTER TABLE profiles ADD COLUMN location GEOGRAPHY(POINT, 4326);

-- Create spatial index
CREATE INDEX idx_profiles_location_geo ON profiles USING GIST(location);

-- Function to update geography from lat/lng
CREATE OR REPLACE FUNCTION update_profile_geography()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profile_geography
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_geography();
```

---

## Installation Summary

### Backend (Node.js)

```bash
# New dependencies
npm install bullmq@^5.66.0
npm install @socket.io/redis-adapter@^8.3.0

# Remove deprecated package
npm uninstall socket.io-redis

# PostGIS - database level, via Railway/Docker
# pg_cron - database level, via Railway addon or manual install
```

### Frontend (Flutter)

```yaml
# pubspec.yaml additions
dependencies:
  flutter_foreground_task: ^8.10.0
  # geolocator already installed: ^14.0.1
```

### Database (PostgreSQL)

```sql
-- One-time setup (Railway supports PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron; -- if available
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Geospatial (DB) | PostGIS | earthdistance | No spatial index, miles-only, spherical model |
| Geospatial (cache) | Redis Geo | Elasticsearch | Overkill, adds operational complexity |
| Job queue | BullMQ | Agenda | Unmaintained since Nov 2022 |
| Job queue | BullMQ | node-cron | In-memory only, lost on restart |
| Socket adapter | @socket.io/redis-adapter | socket.io-redis | Deprecated, renamed in v7 |
| Background location | flutter_foreground_task | workmanager | Not for continuous tracking |
| Background location | flutter_foreground_task | flutter_background_geolocation | Heavy, overkill for this use case |

---

## Risk Assessment

| Component | Risk Level | Mitigation |
|-----------|------------|------------|
| PostGIS installation | LOW | Railway supports PostGIS out of box |
| BullMQ learning curve | LOW | Well-documented, similar to existing Bull patterns |
| Socket adapter migration | LOW | API compatible, mostly import changes |
| Background location (iOS) | MEDIUM | iOS limits to ~30s every 15min when backgrounded; use push notifications |
| Location privacy | HIGH | Implement fuzzing BEFORE launch, audit for trilateration |

---

## Version Summary

| Package | Version | Type |
|---------|---------|------|
| PostGIS | 3.6.x | PostgreSQL extension |
| BullMQ | ^5.66.0 | npm package (new) |
| @socket.io/redis-adapter | ^8.3.0 | npm package (replaces socket.io-redis) |
| flutter_foreground_task | ^8.10.0 | pub.dev package (new) |
| geolocator | ^14.0.1 | pub.dev package (existing) |
| redis | ^4.7.1 | npm package (existing) |
| socket.io | ^4.7.2 | npm package (existing) |

---

## Sources

### Geospatial
- [PostGIS vs earthdistance - Elephant Tamer](https://elephanttamer.net/?p=11)
- [PostGIS Geometry vs Geography - Coord](https://medium.com/coord/postgis-performance-showdown-geometry-vs-geography-ec99967da4f0)
- [Redis Geospatial Documentation](https://redis.io/docs/latest/develop/data-types/geospatial/)
- [Redis GEOSEARCH Command](https://redis.io/docs/latest/commands/geosearch/)

### Job Scheduling
- [BullMQ Official Documentation](https://docs.bullmq.io)
- [BullMQ Delayed Jobs](https://docs.bullmq.io/guide/jobs/delayed)
- [Node.js Scheduler Comparison - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/)
- [pg_cron for Postgres TTL](https://schinckel.net/2021/09/09/automatically-expire-rows-in-postgres/)

### Real-Time & Socket.IO
- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)
- [Scaling Socket.IO - Ably](https://ably.com/topic/scaling-socketio)
- [Socket.IO Rooms Documentation](https://socket.io/docs/v3/rooms/)

### Flutter Background Services
- [flutter_foreground_task Package](https://pub.dev/packages/flutter_foreground_task)
- [Background Location Tracking Guide](https://medium.com/@naveenkumarkompelly99/flutter-background-location-tracking-using-flutter-foreground-task-and-geolocator-38fc68c03bd8)
- [Android 14 Background Restrictions](https://medium.com/@shubhampawar99/handling-background-services-in-flutter-the-right-way-across-android-14-ios-17-b735f3b48af5)

### Privacy & Security
- [Dating App Privacy Risks - Penligent](https://www.penligent.ai/hackinglabs/dating-apps-privacy-risks-and-how-ai-powered-penetration-tools-can-help/)
- [Geolocation Risks in Dating Apps - Check Point](https://research.checkpoint.com/2024/the-illusion-of-privacy-geolocation-risks-in-modern-dating-apps/)
- [Location Obfuscation Techniques](https://www.researchgate.net/publication/224516626_An_Obfuscation-Based_Approach_for_Protecting_Location_Privacy)
