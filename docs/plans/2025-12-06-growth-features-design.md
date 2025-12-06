# VLVT Growth & Differentiation Features Design

**Date:** December 6, 2025
**Status:** Approved
**Timeline:** ~2-3 weeks (quality over speed)

## Overview

This design covers a cohesive feature set built around three pillars:

1. **Trust Layer** - Verified selfies, read receipts, "Who Liked You" prominence
2. **Action Layer** - "Propose a Date" with location picker
3. **Growth Layer** - Golden Ticket referral system earned through engagement

These pillars reinforce each other: trust builds retention, action drives word-of-mouth, and growth compounds both.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUST LAYER                               │
│  Verified Selfies → Read Receipts → "Who Liked You"         │
│         ↓                                                    │
│  Users trust the platform → Stay longer → More matches       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   ACTION LAYER                               │
│  "Propose a Date" → Location Picker → Date Confirmation     │
│         ↓                                                    │
│  Users meet IRL → Success stories → Word of mouth            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   GROWTH LAYER                               │
│  Completed Dates → Earn Golden Tickets → Invite Friends     │
│         ↓                                                    │
│  New verified users → More matches → More dates → Loop       │
└─────────────────────────────────────────────────────────────┘
```

### Backend Changes

| Service | Changes |
|---------|---------|
| `auth-service` | Invite code validation, ticket tracking endpoints |
| `profile-service` | Verification status, new user boost, distance fuzzing |
| `chat-service` | Date proposals, read receipt exposure |

### New Database Tables

- `invite_codes` - Golden Ticket tracking
- `ticket_ledger` - Ticket earning/spending history
- `date_proposals` - Proposed dates between matches
- `verifications` - Selfie verification records

### Third-Party Integrations

- **Google Places API** - Date location search and selection
- **AWS Rekognition** - Face comparison for verification

---

## Feature 1: Golden Ticket Referral System

### How Users Earn Tickets

| Action | Tickets Earned |
|--------|----------------|
| Complete profile verification | +1 (one-time) |
| First mutual match | +1 (one-time) |
| Complete a date (both confirm) | +1 (per date) |
| Referred user completes a date | +1 (bonus) |

### Database Schema

```sql
-- Invite codes (Golden Tickets)
CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) UNIQUE NOT NULL,      -- e.g., "VLVT-A7X9"
  owner_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_by_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE   -- NULL = never expires
);

CREATE INDEX idx_invite_codes_owner ON invite_codes(owner_id);
CREATE INDEX idx_invite_codes_code ON invite_codes(code);

-- Ticket ledger (earning/spending history)
CREATE TABLE ticket_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INT NOT NULL,                   -- +1 or -1
  reason VARCHAR(50) NOT NULL,           -- 'verification', 'first_match', 'date_completed', 'invite_used', 'invite_redeemed'
  reference_id VARCHAR(255),             -- ID of related record (verification, match, date, invite)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ticket_ledger_user ON ticket_ledger(user_id);
```

### API Endpoints

**Auth Service:**

```
GET  /auth/tickets              - Get user's ticket balance and history
POST /auth/tickets/create-code  - Generate a new invite code (costs 1 ticket)
POST /auth/tickets/validate     - Validate invite code during signup
```

**Ticket Balance Response:**
```json
{
  "balance": 2,
  "codes": [
    { "code": "VLVT-A7X9", "used": false, "createdAt": "2025-12-06T..." },
    { "code": "VLVT-B3K2", "used": true, "usedBy": "Jordan", "usedAt": "2025-12-05T..." }
  ],
  "history": [
    { "amount": 1, "reason": "verification", "createdAt": "2025-12-01T..." },
    { "amount": -1, "reason": "invite_created", "createdAt": "2025-12-02T..." }
  ]
}
```

### User Flow

1. User navigates to Profile → "Invite Friends"
2. Sees current ticket balance and existing codes
3. Taps "Create Invite" → Code generated (costs 1 ticket)
4. Shares link: `https://getvlvt.vip/invite/VLVT-A7X9`
5. Friend clicks → Deep link to app store or opens app
6. Friend signs up with code → Gets 1-month free trial
7. Original user notified: "Alex joined using your invite!"

### Deep Link Handling

Update `DeepLinkService` to handle:
- Web: `https://getvlvt.vip/invite/{code}`
- App: `vlvt://invite?code={code}`

Store code in secure storage during signup flow, validate on registration.

---

## Feature 2: Propose a Date

### Database Schema

```sql
CREATE TABLE date_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255) NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  proposer_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Location (from Google Places)
  place_id VARCHAR(255),                 -- Google Place ID for future lookups
  place_name VARCHAR(255) NOT NULL,
  place_address VARCHAR(500),
  place_lat DECIMAL(10, 8),
  place_lng DECIMAL(11, 8),

  -- Timing
  proposed_date DATE NOT NULL,
  proposed_time TIME NOT NULL,

  -- Optional note from proposer
  note TEXT,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined, completed, cancelled
  responded_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  proposer_confirmed BOOLEAN DEFAULT FALSE,
  recipient_confirmed BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_date_proposals_match ON date_proposals(match_id);
CREATE INDEX idx_date_proposals_proposer ON date_proposals(proposer_id);
CREATE INDEX idx_date_proposals_status ON date_proposals(status);
```

### API Endpoints

**Chat Service:**

```
POST   /dates                    - Create date proposal
GET    /dates/:matchId           - Get proposals for a match
PUT    /dates/:id/respond        - Accept or decline
PUT    /dates/:id/confirm        - Confirm date happened
DELETE /dates/:id                - Cancel proposal
```

**Create Proposal Request:**
```json
{
  "matchId": "match-uuid",
  "placeId": "ChIJ...",
  "placeName": "Blue Bottle Coffee",
  "placeAddress": "456 Oak Ave, San Francisco, CA",
  "placeLat": 37.7749,
  "placeLng": -122.4194,
  "proposedDate": "2025-12-14",
  "proposedTime": "19:30",
  "note": "Great lattes, quiet corner spots"
}
```

**Respond Request:**
```json
{
  "response": "accepted",  // or "declined"
  "counterDate": "2025-12-15",  // optional, for suggesting alternative
  "counterTime": "14:00"
}
```

### UI Components

**Chat Screen Addition:**
- Add calendar icon button next to message input
- Tapping opens Date Proposal Sheet

**Date Proposal Sheet:**
- Google Places search input
- Date picker (default: next weekend)
- Time picker (default: 7:00 PM)
- Optional note field
- "Send Proposal" button

**Date Card in Chat:**
- Rendered as special message type
- Shows venue, date/time, note
- Accept/Decline/Suggest buttons for recipient
- Status indicator for proposer

### Ticket Integration

When both `proposer_confirmed` and `recipient_confirmed` are true:
1. Mark proposal as `completed`
2. Award +1 ticket to proposer via `ticket_ledger`
3. If proposer was referred, award +1 bonus ticket to referrer

---

## Feature 3: Verified Selfie System

### Verification Service: AWS Rekognition

**Why Rekognition:**
- Cost effective: ~$1 per 1000 comparisons
- Simple API: Just face comparison, no SDK bloat
- Sufficient for use case: Prove user matches their photos

**Liveness Check (Anti-Bot):**

Rekognition doesn't do liveness, so we implement a simple gesture challenge:
1. App shows random prompt: "Hold up 3 fingers" / "Touch your nose" / "Look left"
2. User must complete within 5 seconds
3. Defeats photo-of-a-photo attacks

### Database Schema

```sql
ALTER TABLE profiles ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Verification attempt data
  selfie_key VARCHAR(255) NOT NULL,      -- R2 key for verification selfie
  reference_photo_key VARCHAR(255),       -- Profile photo used for comparison
  gesture_prompt VARCHAR(50) NOT NULL,    -- What gesture was requested

  -- Rekognition results
  similarity_score DECIMAL(5, 2),         -- 0-100 confidence
  rekognition_response JSONB,             -- Full API response for debugging

  -- Status
  status VARCHAR(20) DEFAULT 'pending',   -- pending, approved, rejected, expired
  rejection_reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_verifications_user ON verifications(user_id);
```

### API Endpoints

**Profile Service:**

```
GET  /verification/prompt        - Get random gesture prompt
POST /verification/submit        - Submit verification selfie
GET  /verification/status        - Check verification status
```

**Submit Verification Request:**
```json
{
  "selfieBase64": "data:image/jpeg;base64,...",
  "gesturePrompt": "three_fingers",
  "referencePhotoIndex": 0  // Which profile photo to compare against
}
```

### Verification Flow

1. User taps "Get Verified" on profile
2. App requests prompt from `/verification/prompt`
3. Shows camera with gesture instruction and 5-second countdown
4. User takes selfie matching gesture
5. App submits to `/verification/submit`
6. Backend:
   - Uploads selfie to R2
   - Calls Rekognition `CompareFaces` with selfie + profile photo
   - If similarity > 90%, mark verified
   - Award +1 ticket for first verification
7. User sees "Verified" badge on profile

### Discovery Filter

Add filter toggle: "Show verified only"

Modify discovery query:
```sql
WHERE ($showVerifiedOnly = FALSE OR p.is_verified = TRUE)
```

---

## Feature 4: Trust & Transparency UI

### Read Receipts

**Already have:** `messages.delivered_at`, `messages.read_at`

**UI Addition:**
- Below each sent message bubble:
  - `✓` = Sent (message exists)
  - `✓✓` = Delivered (`delivered_at` not null)
  - `✓✓` gold = Read (`read_at` not null, show timestamp)

**Socket Event:**
- When recipient reads, emit `message_read` event
- Sender's UI updates in real-time

### "Who Liked You" Banner

**Placement:** Top of Discovery screen, above profile cards

**UI:**
```
┌─────────────────────────────────────────────────────┐
│ 💛 3 people liked you                               │
│    See who's already interested →                   │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Tapping opens modal with blurred profile grid
- Tapping any profile reveals it and shows Like/Pass
- Uses existing `/swipes/received` endpoint
- Count badge updates in real-time via socket

---

## Feature 5: Quick Wins (Backend Tweaks)

### New User Boost

Modify discovery query to prioritize users created in last 48 hours:

```sql
ORDER BY
  CASE
    WHEN p.created_at > NOW() - INTERVAL '48 hours' THEN 0
    ELSE 1
  END,
  distance ASC
LIMIT 20
```

### Distance Fuzzing

When results < 5, auto-expand search:

```typescript
async function discoverProfiles(userId: string, maxDistance: number) {
  let results = await queryProfiles(userId, maxDistance);

  if (results.length < 5 && maxDistance < 200) {
    const expanded = await queryProfiles(userId, 200);
    // Mark expanded results
    expanded.forEach(p => {
      if (p.distance > maxDistance) {
        p.expandedSearch = true;
      }
    });
    results = expanded;
  }

  return results;
}
```

### Concierge Empty State

Replace generic empty state with:
- Friendly "concierge" messaging
- Push notification permission prompt
- Profile completion CTA
- Premium feel, not "no users" feel

---

## Implementation Phases

### Phase 1: Quick Wins (1-2 days)

**Backend:**
- [ ] New user boost in discovery query
- [ ] Distance fuzzing fallback logic

**Frontend:**
- [ ] Read receipts in chat bubbles
- [ ] "Who Liked You" banner on Discovery
- [ ] Concierge empty state UI

### Phase 2: Golden Tickets (3-4 days)

**Backend:**
- [ ] Create `invite_codes` table
- [ ] Create `ticket_ledger` table
- [ ] Implement ticket balance endpoint
- [ ] Implement invite code creation
- [ ] Implement invite code validation
- [ ] Deep link handling for invites

**Frontend:**
- [ ] Invite screen with ticket balance
- [ ] Share invite flow
- [ ] Invite code input during signup
- [ ] Ticket earned notifications

### Phase 3: Propose a Date (3-4 days)

**Backend:**
- [ ] Create `date_proposals` table
- [ ] Implement proposal CRUD endpoints
- [ ] Integrate Google Places API
- [ ] Ticket award on date completion

**Frontend:**
- [ ] Date proposal sheet
- [ ] Google Places search integration
- [ ] Date card component in chat
- [ ] Accept/Decline/Suggest flow
- [ ] Date confirmation flow

### Phase 4: Verification (2-3 days)

**Backend:**
- [ ] Set up AWS Rekognition
- [ ] Create `verifications` table
- [ ] Add `is_verified` to profiles
- [ ] Implement verification endpoints
- [ ] Gesture prompt generation

**Frontend:**
- [ ] Verification camera flow
- [ ] Gesture prompt display
- [ ] Verification status display
- [ ] Verified badge on profiles
- [ ] Discovery filter toggle

---

## Environment Variables Required

```bash
# Google Places API
GOOGLE_PLACES_API_KEY=your_api_key

# AWS Rekognition
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
REKOGNITION_SIMILARITY_THRESHOLD=90
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Invite code usage rate | >20% of issued codes used |
| Date proposals per match | >0.3 proposals per match |
| Verification completion | >50% of active users |
| Empty state → notification opt-in | >60% conversion |

---

## Open Questions

1. Should declined date proposals be hidden or remain visible in chat?
2. Should verification selfies be stored permanently or deleted after approval?
3. Should "Who Liked You" show count for free users but require premium to reveal?

---

**Approved by:** User
**Design by:** Claude
**Ready for implementation**
