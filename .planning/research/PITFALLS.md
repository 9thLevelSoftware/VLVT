# Domain Pitfalls: Dating App Production Readiness

**Domain:** Dating app production launch preparation
**Researched:** 2026-01-24
**Confidence:** HIGH (multiple documented breaches, lawsuits, regulatory actions 2024-2025)

---

## Critical Pitfalls

Mistakes that cause data breaches, regulatory fines, lawsuits, or user harm.

---

### Pitfall 1: Exposed API Keys and Secrets in App Code

**What goes wrong:** API keys, encryption keys, and cloud storage credentials are embedded in the app code or committed to repositories. Researchers extract these secrets and gain direct access to user data.

**Real incidents:**
- April 2025: M.A.D Mobile apps (BDSM People, Pink, Translove, Chica, Brish) exposed 1.5 million explicit images because API keys and encryption passwords were published in app code, granting access to Google Cloud Storage buckets with no authentication
- July 2025: Tea app breach exposed 72,000 images and 1.1 million messages due to Firebase storage bucket misconfiguration

**Why it happens:**
- Secrets hardcoded during development and never removed
- `.env` files committed to version control
- Cloud storage buckets default to public access
- No security review before release

**Warning signs:**
- Secrets visible in decompiled APK/IPA
- Environment files in git history
- Cloud storage URLs accessible without authentication
- Third-party security researchers reaching out

**Prevention:**
1. Use platform-specific secure storage (Android Keystore, iOS Keychain) for any client-side secrets
2. Backend secrets via environment variables, never in code
3. Pre-commit hooks to scan for secrets (`gitleaks`, `trufflehog`)
4. Automated CI scans for exposed credentials
5. Cloud storage buckets must require authentication by default
6. Regular security audits before each release

**Phase to address:** Pre-launch security audit (immediate)

**Sources:**
- [Cybernews: Dating Apps Leak Private Photos](https://cybernews.com/security/ios-dating-apps-leak-private-photos/)
- [Appknox: Tea App Data Breach Analysis](https://www.appknox.com/blog/tea-app-data-breach-security-flaws-analysis-appknox)

---

### Pitfall 2: Broken Object-Level Authorization (BOLA/IDOR)

**What goes wrong:** API endpoints return or modify data based on user-supplied IDs without verifying the requesting user owns that data. Attackers enumerate IDs to access other users' profiles, messages, photos, and location data.

**Real incidents:**
- November 2025: Feeld dating app had BOLA vulnerabilities allowing access to other users' chats (including deleted chats), profile modification, and photo access without authentication
- May 2025: Raw dating app exposed user locations accurate to street level, birth dates, and sexual preferences via IDOR vulnerability
- 2024: Researchers found API vulnerabilities in Tinder, Bumble, Grindr, and Hinge exposing precise user locations

**Why it happens:**
- Trusting client-supplied IDs (user_id, chat_id, photo_id) without verification
- Authorization checks missing from some endpoints
- "Security through obscurity" (assuming IDs won't be guessed)
- Separate authorization logic per endpoint instead of middleware

**Warning signs:**
- Endpoints accept user IDs from request parameters
- No middleware verifying resource ownership
- Different authorization implementations across services
- Pentesting reveals access to other users' data

**Prevention:**
1. Authorization middleware that verifies resource ownership for EVERY endpoint
2. User ID derived from JWT, never from request body/parameters
3. Consistent authorization patterns across all services
4. Automated API security testing in CI (`OWASP ZAP`, `Burp Suite`)
5. Regular penetration testing before major releases
6. Implement row-level security in database queries

**Phase to address:** Pre-launch security audit (immediate)

**Sources:**
- [FireTail: Feeld Dating App API Vulnerabilities](https://www.firetail.ai/blog/feeld-dating-app-api)
- [Dark Reading: Dating Apps Expose Location](https://www.darkreading.com/application-security/swipe-right-for-data-leaks-dating-apps-expose-location-more)
- [API Security Issue 271: Raw Dating App](https://apisecurity.io/issue-271-api-breaches-surge-in-apac-raw-dating-app-exposes-users-api-credential-missteps-api-sprawl/)

---

### Pitfall 3: GDPR Special Category Data Violations

**What goes wrong:** Dating apps that imply sexual orientation or sexual behavior (including "After Hours" modes, LGBTQ+ dating, hookup features) handle GDPR Article 9 "special category" data without proper explicit consent, lawful basis, or data minimization.

**Real incidents:**
- Grindr fined 6.5M EUR (2024, upheld on appeal) for sharing GPS location, IP addresses, and user data with advertising partners without valid consent. Key violation: merely using Grindr "strongly indicates sexual orientation" - making ALL user data special category data
- Bumble Inc. paid 32M GBP settlement (2024) for collecting facial recognition biometric data without explicit consent

**Why it happens:**
- Consent bundled into general privacy policy acceptance (invalid under GDPR)
- Third-party SDKs (analytics, ads, crash reporting) receive location and behavioral data
- "Legitimate interest" claimed instead of explicit consent for special category data
- Assuming privacy policy agreement equals GDPR consent (it does not)
- Treating profile creation as manifesting data public (regulators rejected this for dating apps)

**Warning signs:**
- Single checkbox for privacy policy acceptance
- Analytics/ad SDKs have access to location data
- No separate, specific consent for data processing purposes
- User cannot use app without consenting to optional processing
- Data shared with "partners" without specifying what data and which partners

**Prevention:**
1. Explicit, granular consent for each processing purpose (matching, analytics, personalization)
2. Service must be usable without consenting to non-essential processing
3. No location data shared with ANY third party (including analytics)
4. Data minimization: store only what's necessary, delete when purpose fulfilled
5. Right to erasure: complete deletion within 30 days, including backups (put "beyond use")
6. Appoint Data Protection Officer (required when processing special category data at scale)
7. Document lawful basis for ALL processing under Article 6 AND Article 9
8. Conduct Data Protection Impact Assessment before launch

**VLVT-specific risk:** After Hours Mode implies sexual/romantic context, making ALL associated data special category data under GDPR - same as Grindr ruling.

**Phase to address:** Pre-launch compliance review (critical)

**Sources:**
- [Computer Weekly: Grindr GDPR Fine](https://www.computerweekly.com/news/252495431/Grindr-complaint-results-in-96m-GDPR-fine)
- [NOYB: Grindr Fine Confirmed](https://noyb.eu/en/norwegian-court-confirms-eu-57-million-fine-grindr)
- [TechCrunch: Grindr GDPR Consent Breaches](https://techcrunch.com/2021/12/15/grindr-final-gdpr-fine/)
- [GDPRhub: Article 9 GDPR](https://gdprhub.eu/Article_9_GDPR)

---

### Pitfall 4: Ban Evasion Through Trivial Account Recreation

**What goes wrong:** Banned users (including those reported for sexual assault) create new accounts within minutes using the same name, photos, and birthday. Serial offenders continue targeting victims.

**Real incidents:**
- February 2025 (The Markup investigation): Banned Tinder users could immediately create new accounts with identical name, birthday, and photos; hop to Hinge without changes
- December 2025: 6 women sued Hinge/Tinder after being assaulted by a doctor who remained on platforms despite reports since 2020, despite being "banned" multiple times
- Match Group tracked sexual assault reports since 2016 (hundreds per week by 2022) but failed to prevent repeat offenders

**Why it happens:**
- Bans tied to email/phone (easily bypassed with burner accounts)
- No photo hashing to detect banned users' images
- No device fingerprinting
- Verification data not used for ban enforcement (identity verified but not checked against ban database)
- Cross-platform ban enforcement not implemented
- No behavioral pattern detection

**Warning signs:**
- Reports describing same person from "different" accounts
- Same device ID appearing across multiple accounts
- New accounts with photos matching banned accounts (detectable via perceptual hashing)
- User reports mentioning "they came back"

**Prevention:**
1. Device fingerprinting (Android ID, IDFA/GAID, hardware characteristics)
2. Photo hashing: perceptual hash all profile photos, check against banned photo database
3. Face verification comparison against banned face database
4. Phone number reputation scoring (detect burner numbers, VoIP)
5. Behavioral pattern detection (messaging patterns, report velocity)
6. Rate limit account creation from same device/IP
7. Ban the verified identity, not just the account

**VLVT advantage:** KYCAid + Rekognition verification creates persistent identity - ban the biometric identity, not the email address.

**Phase to address:** Pre-launch safety system (critical)

**Sources:**
- [NPR: Match Group Slow to Remove Dangerous Daters](https://www.npr.org/2025/02/21/nx-s1-5301046/investigation-finds-online-dating-conglomerate-slow-to-ban-users-accused-of-assault)
- [The Markup: Dating App Cover-Up](https://themarkup.org/investigations/2025/02/13/dating-app-tinder-hinge-cover-up)
- [Sauder Schelkopf: Match Group Investigation](https://sauderschelkopf.com/investigations/match-groups-dating-app-failure-to-protect-users-from-sexual-assault-lawsuit-investigation/)

---

### Pitfall 5: Trilateration Attack via API Distance Data

**What goes wrong:** Attackers can pinpoint user locations (within 2-111 meters) by spoofing their own GPS coordinates from multiple points and measuring distance changes in API responses or profile ordering.

**Real incidents:**
- 2024: KU Leuven researchers demonstrated trilateration on Grindr, Hinge, Bumble, Happn, Badoo, and Hily
- Hornet app: researchers achieved 10-meter accuracy even when distance display was disabled
- All 15 dating apps analyzed leaked some form of sensitive location data

**Why it happens:**
- API returns exact distance values (or distances with too many decimal places)
- Profile sorting reveals relative distance even without showing numbers
- "Hide distance" only affects UI, not backend calculations
- Rate limiting insufficient to prevent rapid trilateration queries

**Warning signs:**
- Distance values have more than 0 decimal places
- Profile ordering changes predictably when user moves
- Distance calculations performed client-side
- No rate limiting on location-based queries

**Prevention:**
1. Round coordinates to 3 decimal places (~1km uncertainty) SERVER-SIDE, not client
2. Add random jitter (+/- 500m) to stored coordinates for proximity calculations
3. Quantize distance into buckets ("< 1km", "1-5km", "5-15km") - never continuous values
4. Randomize profile ordering within distance buckets
5. Rate limit location-based queries (max 10/minute per user)
6. Detect and block rapid location changes indicating spoofing

**Phase to address:** Pre-launch security audit (critical)

**Sources:**
- [Check Point Research: Geolocation Risks in Dating Apps](https://research.checkpoint.com/2024/the-illusion-of-privacy-geolocation-risks-in-modern-dating-apps/)
- [Dark Reading: Dating Apps Expose Location](https://www.darkreading.com/application-security/swipe-right-for-data-leaks-dating-apps-expose-location-more)
- [PortSwigger: Bumble Trilateration Vulnerability](https://portswigger.net/daily-swig/trilateration-vulnerability-in-dating-app-bumble-leaked-users-exact-location)

---

### Pitfall 6: Deepfake Bypass of Identity Verification

**What goes wrong:** Scammers use real-time deepfake software to pass live selfie verification, then use AI-generated profile photos. Standard liveness detection is increasingly defeated.

**Real incidents:**
- 2024: Dating industry had highest ID fraud rate (8.9%) of ALL industries - higher than finance (2.7%)
- 3/4 of UK dating app users encountered deepfakes; 19% were personally deceived
- Scammers use DeepFaceLive, Magicam, and Amigo AI to alter face, voice, gender, and race during live verification
- Only 0.1% of people can distinguish real from fake images/video

**Why it happens:**
- Standard liveness checks (blink, head turn) are easily spoofed with pre-recorded deepfakes
- Virtual camera software can inject manipulated video streams
- Face-swap technology improved dramatically in 2024-2025
- Verification happens once at signup, never again

**Warning signs:**
- Verification selfies have subtle inconsistencies (lighting, eye movement patterns)
- Profile photos look "too perfect" or have AI artifacts
- Behavioral patterns inconsistent with verified identity (age, language, timezone)
- High rate of romance scam reports despite verification

**Prevention:**
1. Use certified liveness detection (ISO 30107-3 compliant)
2. Implement deepfake detection models alongside verification
3. Require randomized, unpredictable verification actions (specific phrase, random gesture sequence)
4. Check uploaded photos against AI-generation detectors
5. Block known virtual camera applications
6. Periodic re-verification for active users
7. Cross-reference with fraud databases (not just identity verification)

**AWS Rekognition caution:** Known bias issues (higher error rates for darker-skinned women). Use 99%+ confidence threshold AND human review for edge cases, not default 80% threshold.

**Phase to address:** Verification system hardening (high priority)

**Sources:**
- [Sumsub: Deepfakes on Dating Apps](https://sumsub.com/newsroom/one-in-five-single-brits-have-already-been-duped-by-deepfakes-on-dating-apps/)
- [Veriff: Real-time Deepfake Fraud](https://www.veriff.com/identity-verification/news/real-time-deepfake-fraud-in-2025-fighting-back-against-ai-driven-scams)
- [DeepStrike: Deepfake Statistics 2025](https://deepstrike.io/blog/deepfake-statistics-2025)

---

### Pitfall 7: Chat History Destruction Enables Repeat Offenders

**What goes wrong:** Bad actors unmatch victims before they can report, erasing chat evidence. Platforms cannot investigate patterns; victims cannot prove harassment.

**Real incidents:**
- December 2025 lawsuit: "Unmatch-before-report" explicitly cited as "defective design" enabling repeat sexual assault
- Serial offenders learned to unmatch immediately after assault/harassment
- Platforms cannot correlate reports without preserved evidence

**Why it happens:**
- Unmatching deletes conversation history on both sides
- No server-side retention for safety investigations
- Ephemeral chat features prioritize privacy over safety
- No mechanism to report after unmatch

**Warning signs:**
- High unmatch rate for specific users immediately after messaging
- Reports mentioning "they unmatched me before I could report"
- Abuse patterns not correlating with reports
- Low evidence quality in safety investigations

**Prevention:**
1. Preserve chat history server-side for 30-90 days post-unmatch (encrypted, access-restricted)
2. Allow reporting even after unmatch with preserved evidence
3. Flag rapid unmatch patterns as suspicious behavior
4. Implement "shadow archive" - unmatching hides from user but preserves for safety team
5. Notify users they can report previous matches from match history
6. Document retention policy clearly in Terms of Service

**VLVT ephemeral chat consideration:** Server-side retention for safety investigations is compatible with ephemeral UI. Users don't see the history, but safety team can.

**Phase to address:** Safety system implementation (critical for launch)

**Sources:**
- [The Markup: Dating App Cover-Up Investigation](https://themarkup.org/investigations/2025/02/13/dating-app-tinder-hinge-cover-up)
- [Denver Trial: Match Group Lawsuit](https://www.denvertrial.com/law-firms-sue-hinge-and-match-group-after-serial-rapist-assaults-multiple-users-on-its-platform/)

---

## Moderate Pitfalls

Mistakes that cause operational issues, technical debt, user churn, or delayed launches.

---

### Pitfall 8: SMS Verification Easily Bypassed

**What goes wrong:** Phone verification intended to prevent fake accounts is trivially bypassed with virtual phone numbers, allowing bot networks and banned users to rejoin instantly.

**Why it happens:**
- Services like Tinderophone sell verification-ready numbers
- VoIP detection is imperfect
- Burner phone numbers are cheap and abundant
- No additional signals correlated with phone verification

**Warning signs:**
- High rate of accounts from known VoIP providers
- Multiple accounts verified with numbers from same provider
- Banned users returning within hours
- Bot accounts passing verification

**Prevention:**
1. Phone number reputation scoring (detect burner numbers, carrier type)
2. Block known VoIP providers and verification bypass services
3. Rate limit verifications from same IP/device
4. Combine phone with device fingerprinting
5. Consider phone as one signal, not sole gate
6. Monitor for suspicious verification patterns

**Phase to address:** Authentication hardening (moderate priority)

**Sources:**
- [Infobip: Verification Without Phone](https://www.infobip.com/blog/how-to-get-verified-without-your-phone)
- [IS Decisions: Why SMS 2FA Is Not Secure](https://www.isdecisions.com/en/blog/mfa/why-sms-authentication-2fa-not-secure)

---

### Pitfall 9: Bot and Fake Profile Proliferation

**What goes wrong:** Automated accounts flood the platform with scam bots, romance fraud operators, and spam. Over 15% of dating profiles are fake or bot-generated industry-wide.

**Why it happens:**
- Basic CAPTCHA bypassed by human fraud farms
- Account creation has insufficient friction
- AI generates convincing fake photos and bios
- Scammers profit enough ($4,400 average per romance scam victim) to pay subscription costs

**Warning signs:**
- Rapid-fire matching/messaging from new accounts
- Generic profile photos (AI-generated or stock)
- Copy-paste message patterns
- High report rate for specific user segments
- Surge in sign-ups from single IP range

**Prevention:**
1. Multi-layered verification (phone + photo + behavior)
2. Behavioral analysis: flag rapid matching, copy-paste messaging, external link sharing
3. AI-powered photo authenticity detection
4. Honeypot fields in registration (invisible to humans, filled by bots)
5. Rate limit account creation per device/IP
6. Ongoing behavioral monitoring, not just signup verification
7. Phone number reputation scoring

**Phase to address:** Anti-abuse systems (moderate priority)

**Sources:**
- [Prove: Dating App Fraud Issues](https://www.prove.com/blog/3-dating-app-fraud-issues-that-can-be-addressed-with-identity-verification)
- [Verified Visitors: Dating Fraud Bots](https://www.verifiedvisitors.com/threat-research/dating-and-romance-fraud-bots)
- [Anura: Dating App Fraud](https://www.anura.io/blog/dating-app-fraud-why-you-need-to-swipe-left)

---

### Pitfall 10: Right to Erasure Implementation Gaps

**What goes wrong:** Users request account deletion but data persists in backups, logs, analytics, third-party services, or is only "soft deleted." GDPR requires complete erasure within 30 days.

**Why it happens:**
- Soft delete flags data without removing it
- Backups not considered in deletion process
- Third-party services (analytics, crash reporting) retain data
- Logs contain PII
- No systematic data mapping (don't know where all data lives)

**Warning signs:**
- Deleted users can still be found in database queries
- Backup restoration brings back deleted accounts
- Third-party dashboards show deleted user data
- No deletion confirmation sent to users
- GDPR subject access requests reveal "deleted" data

**Prevention:**
1. Hard delete from production databases (not soft delete for user-requested deletions)
2. Document all data locations (Record of Processing Activities)
3. Backups: put deleted data "beyond use" - cannot be restored or accessed
4. Notify third parties of deletion requirements
5. Purge PII from logs (or implement log retention limits)
6. Send deletion confirmation to user
7. Test deletion with penetration testing / data recovery attempts
8. Clear timeline: complete within 30 days, notify if extension needed

**Apple App Store requirement:** Apps allowing account creation MUST allow in-app account deletion.

**Phase to address:** GDPR compliance (high priority)

**Sources:**
- [GDPR.eu: Right to be Forgotten](https://gdpr.eu/right-to-be-forgotten/)
- [Authgear: Right to Erasure for Apps](https://www.authgear.com/post/the-right-to-erasure-and-how-you-can-follow-it-for-your-apps)
- [VeraSafe: GDPR and Backup Systems](https://verasafe.com/blog/do-i-need-to-erase-personal-data-from-backup-systems-under-the-gdpr/)

---

### Pitfall 11: Insufficient Content Moderation at Scale

**What goes wrong:** Reports flood in faster than moderators can review. AI moderation alone misses context-dependent harassment. Bad actors exploit gaps.

**Real incidents:**
- Match Group received hundreds of sexual assault reports per week but dismissed safety team (2022-2024)
- Tea app removed from App Store for excessive complaints about minors' information being posted
- 52% of dating apps experienced data breach/leak in past 3 years (Mozilla 2024)
- 28% of online daters harassed through dating apps (women: 42%)

**Why it happens:**
- AI struggles with coded language, cultural context, sarcasm
- Human moderation doesn't scale with growth
- No prioritization system for high-severity reports
- Moderator burnout from exposure to harmful content
- "Mass reporting" weaponized against legitimate users

**Warning signs:**
- Report queue growing faster than resolution rate
- Average resolution time increasing
- Moderator turnover/burnout
- User complaints about unresolved reports
- App store reviews mentioning safety concerns

**Prevention:**
1. AI triage: auto-prioritize high-severity reports (assault, threats, minors)
2. Auto-action for clear violations (explicit content, slurs, known scam patterns)
3. Human review for context-dependent cases
4. Category-specific queues with different SLAs
5. Report-abuse detection (users weaponizing report system)
6. Moderator wellness: rotation, exposure limits, mental health support
7. Publish transparency reports (report volumes, resolution times, actions taken)

**Phase to address:** Operations scaling (pre-launch)

**Sources:**
- [Checkstep: Content Moderation and Dating 2024](https://www.checkstep.com/3-facts-about-content-moderation-and-dating-2024/)
- [Mentor Research: Criticisms of Major Dating Apps](https://www.mentorresearch.org/criticisms-of-tinder-hinge-matchcom-plenty-of-fish-and-okcupid)
- [NPR: Match Group Safety Team Dismantled](https://www.npr.org/2025/02/21/nx-s1-5301046/investigation-finds-online-dating-conglomerate-slow-to-ban-users-accused-of-assault)

---

### Pitfall 12: PII in Logs and Error Messages

**What goes wrong:** Logging captures sensitive user data (emails, locations, messages, tokens). When logs are accessed by support staff, exposed in errors, or breached, PII is compromised.

**Why it happens:**
- Default logging captures full request/response bodies
- Error messages include user context
- Debug logging left enabled in production
- Log aggregation services store data in third-party systems
- No log review in security audit

**Warning signs:**
- Searching logs reveals user emails, locations, message content
- Error tracking (Sentry, Bugsnag) contains user identifiers
- Support staff can search for users in logs
- Log retention exceeds operational necessity

**Prevention:**
1. Structured logging with explicit field allowlists (never log request bodies by default)
2. PII redaction middleware for all log outputs
3. Separate correlation IDs from user IDs in logs
4. Log retention limits (30 days operational, then aggregate/delete)
5. Review log outputs as part of security audit
6. Error tracking: enable PII scrubbing, audit what's captured

**Phase to address:** Pre-launch security audit (high priority)

---

### Pitfall 13: Cold Start / Chicken-and-Egg Launch Failure

**What goes wrong:** App launches to empty user base. Early users see no matches, leave, never return. Network effects never bootstrap.

**Why it happens:**
- Launching nationally/globally instead of concentrated geographic area
- No pre-launch user acquisition strategy
- Paid ads at launch have terrible ROI (high cost per acquisition, low conversion, fast churn)
- Test users mixed with real users

**Warning signs:**
- Users open app, see no nearby matches
- High Day 1 churn
- Negative reviews mentioning "no one here"
- Users assume app is dead

**Prevention:**
1. Geographic concentration: launch in ONE city/region, saturate before expanding
2. Pre-launch waitlist with referral incentives
3. Seed initial users (events, campus, community partnerships)
4. Clear test user separation (never show test accounts to real users)
5. Expectations setting: communicate launch phase to early users
6. Consider closed beta with invites to concentrate density

**Phase to address:** Launch planning (pre-launch)

**Sources:**
- [SkaDate: Solving the Cold Start Problem](https://www.skadate.com/how-to-launch-a-dating-app-in-2026-solving-the-cold-start-problem/)
- [Guru Technolabs: Why Dating Apps Fail](https://www.gurutechnolabs.com/why-dating-apps-fail/)

---

## Minor Pitfalls

Mistakes that cause friction but are fixable with iteration.

---

### Pitfall 14: TLS/SSL Misconfiguration

**What goes wrong:** Outdated TLS configurations allow interception of user data in transit. Certificate pinning not implemented or improperly configured.

**Real finding:** 7 major dating platforms (Badoo, Zoosk, AdultFriendFinder, Match, Grindr, Ourtime, Ashley Madison) showed high TLS configuration issues in 2025 Business Digital Index analysis.

**Prevention:**
1. TLS 1.3 minimum (deprecate 1.2)
2. Certificate pinning in mobile apps
3. HSTS headers with long max-age
4. Regular SSL Labs testing (aim for A+ rating)
5. Automated certificate renewal monitoring

**Phase to address:** Infrastructure hardening (moderate priority)

**Sources:**
- [Business Digital Index: Dating Apps Study](https://businessdigitalindex.com/research/75-of-dating-apps-are-unsafe-new-study-finds/)
- [Promon: Dating App Data Breach Prevention](https://promon.io/security-news/dating-app-data-breach)

---

### Pitfall 15: Push Notification Privacy Leaks

**What goes wrong:** Push notifications display message content or sender identity on lock screen, exposing user's dating activity to anyone who sees their phone.

**Why it happens:**
- Default notification content shows message preview
- Notification title reveals app name and context
- No user control over notification privacy

**Prevention:**
1. Default to privacy-preserving notifications ("You have a new message")
2. User-configurable notification detail level
3. Never show explicit content in notifications
4. Consider generic app icon/name for lock screen
5. Rich notifications only when phone is unlocked (Face ID/Touch ID)

**Phase to address:** UX polish (lower priority)

---

### Pitfall 16: OAuth Token Mishandling

**What goes wrong:** Social login tokens stored insecurely, providing attackers access to user's full social media profile beyond necessary scope.

**Why it happens:**
- Tokens stored in plain text in app storage
- Requesting excessive OAuth scopes
- Tokens not rotated or refreshed properly
- Third-party services receive unnecessary tokens

**Prevention:**
1. Request minimum necessary OAuth scopes
2. Store tokens in secure storage (Keychain/Keystore)
3. Implement proper token refresh rotation
4. Never share OAuth tokens with third parties
5. Audit OAuth implementation for scope creep

**Phase to address:** Authentication audit (moderate priority)

**Sources:**
- [Promon: Dating App Data Breach](https://promon.io/security-news/dating-app-data-breach)

---

## Phase-Specific Warning Summary

| Phase | Critical Pitfalls | Moderate Pitfalls |
|-------|-------------------|-------------------|
| **Security Audit** | Exposed secrets (1), BOLA/IDOR (2), Trilateration (5), PII in logs (12), TLS config (14) | OAuth tokens (16) |
| **GDPR Compliance** | Special category data (3), Right to erasure (10) | Notification privacy (15) |
| **Safety Systems** | Ban evasion (4), Chat preservation (7) | Content moderation (11) |
| **Verification Hardening** | Deepfake bypass (6) | SMS bypass (8), Bot proliferation (9) |
| **Launch Preparation** | - | Cold start (13) |

---

## VLVT-Specific Risk Assessment

Based on VLVT's architecture and features:

| VLVT Component | Highest Risk Pitfall | Recommended Action |
|----------------|---------------------|-------------------|
| After Hours Mode | GDPR special category (3) | Explicit consent flow, no third-party data sharing |
| Location-based matching | Trilateration (5) | Server-side coordinate fuzzing with jitter |
| KYCAid + Rekognition | Deepfake bypass (6), Rekognition bias | Add deepfake detection, 99% threshold, periodic re-verification |
| Ephemeral chat | Chat preservation gap (7) | Server-side retention for safety, ephemeral UI only |
| User blocking/reporting | Ban evasion (4) | Hash photos, fingerprint devices, ban biometric identity |
| R2 photo storage | Exposed secrets (1) | Audit bucket permissions, no public access |
| JWT authentication | BOLA/IDOR (2) | Authorization middleware on ALL endpoints |
| Railway deployment | PII in logs (12) | Structured logging with PII redaction |

---

## Pre-Launch Checklist

Critical items that MUST be verified before production launch:

### Security
- [ ] No secrets in app code or repository
- [ ] All API endpoints have authorization middleware
- [ ] Location data rounded server-side (3 decimal places + jitter)
- [ ] Photo storage buckets require authentication
- [ ] TLS 1.3 with certificate pinning
- [ ] Rate limiting on all endpoints
- [ ] Penetration test completed

### GDPR
- [ ] Explicit, granular consent for each processing purpose
- [ ] Right to erasure implemented (hard delete within 30 days)
- [ ] Data Protection Impact Assessment completed
- [ ] No location data shared with third parties
- [ ] Privacy policy specifies exact data processing

### Safety
- [ ] Chat history preserved server-side post-unmatch
- [ ] Reporting available for unmatched users
- [ ] Device fingerprinting for ban enforcement
- [ ] Photo hashing against banned user database
- [ ] Moderation queue with prioritization

### Operations
- [ ] PII redacted from all logs
- [ ] Monitoring and alerting configured
- [ ] Database backup and recovery tested
- [ ] Incident response plan documented
- [ ] Test users cannot appear to real users

---

## Sources

### Security Research
- [Check Point: Geolocation Risks in Dating Apps](https://research.checkpoint.com/2024/the-illusion-of-privacy-geolocation-risks-in-modern-dating-apps/)
- [FireTail: Feeld API Vulnerabilities](https://www.firetail.ai/blog/feeld-dating-app-api)
- [Cybernews: Dating Apps Leak Photos](https://cybernews.com/security/ios-dating-apps-leak-private-photos/)
- [Business Digital Index: 75% of Dating Apps Unsafe](https://businessdigitalindex.com/research/75-of-dating-apps-are-unsafe-new-study-finds/)

### Legal/Regulatory
- [Grindr GDPR Fine - TechCrunch](https://techcrunch.com/2021/12/15/grindr-final-gdpr-fine/)
- [NOYB: Grindr Fine Upheld](https://noyb.eu/en/norwegian-court-confirms-eu-57-million-fine-grindr)
- [Match Group Lawsuit - The Markup](https://themarkup.org/investigations/2025/02/13/dating-app-tinder-hinge-cover-up)
- [FTC Match Group Settlement](https://www.ftc.gov/news-events/news/press-releases/2025/08/match-group-agrees-pay-14-million-permanently-stop-deceptive-advertising-cancellation-billing)

### Industry Reports
- [Sumsub: Deepfakes on Dating Apps](https://sumsub.com/newsroom/one-in-five-single-brits-have-already-been-duped-by-deepfakes-on-dating-apps/)
- [NPR: Match Group Investigation](https://www.npr.org/2025/02/21/nx-s1-5301046/investigation-finds-online-dating-conglomerate-slow-to-ban-users-accused-of-assault)
- [Appknox: Tea App Breach Analysis](https://www.appknox.com/blog/tea-app-data-breach-security-flaws-analysis-appknox)

### Technical Standards
- [GDPR Article 17: Right to Erasure](https://gdpr-info.eu/art-17-gdpr/)
- [GDPR Article 9: Special Category Data](https://gdprhub.eu/Article_9_GDPR)
- [OWASP API Security Top 10](https://owasp.org/API-Security/)
