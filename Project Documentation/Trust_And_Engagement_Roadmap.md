# KinBech — Trust & Engagement Roadmap (Feature List)

**Purpose:** Ek hi jagah poori list — app ko **high-trustable** aur **engaging** banane ke liye kya-kya handle karna hai.
**Status:** Sirf list / plan. Koi implementation nahi.
**Last reviewed:** October 2026

> Ye document code ke against verify kiya gaya hai. Har item ke saath "Existing hook" diya hai — matlab code mein kya already maujood hai jise use kiya ja sakta hai.

---

## Core Insight

| Problem | Detail | File |
|---------|--------|------|
| Trust signals inflated hain | Har individual seller ko `verified: true` ("Phone Verified") milta hai — kyunki sab OTP se signup karte hain. Matlab **badge sabke paas = badge ki value zero** | `Backend/src/utils/listing.js` (`resolveListingVerification`) |
| Ranking differentiate nahi karti | Sab individuals ko same `trustBoost: 12`. Shop ko 25, baaki 0 | `Backend/src/utils/listing.js` (`listingTrustBoost`) |
| Wapas aane ki koi wajah nahi | Push/alert nahi hain. User sirf apni marzi se app kholta hai | `Mobile/src/services/pushAlerts.js` |

**Rule:** Trust = wo signal jo **fake karna mushkil** ho. Engagement = **kal wapas aane ki wajah**.

---

## A. TRUST PILLARS

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| A1 | **Tiered honest badges** — Phone (baseline, chhota) → **ID/Individual Verified** (naya, admin-approved) → **Business Verified** | Abhi "Phone Verified" sabke paas = noise. Real differentiation se trust rank kaam karegi | `Shop.isVerified` + `verificationStatus` exist (shop ke liye). **Individual ke liye User model par naya verification flow chahiye** | P0 |
| A2 | **Individual ID verification flow** — document upload → admin approve/reject → badge | Buyers ko bharosa; fake sellers kam | Shop wala flow copy kar sakte hain (`ShopVerificationScreen.js`, `routes/shops.js`) | P0 |
| A3 | **Trust boost ko real karo** — verification tier ke hisaab se boost do (e.g. ID=40, Business=25, Phone=5) | Ranking mein verified sellers upar aayen | `listingTrustBoost` already ranking mein use hota hai | P0 |
| A4 | **Review sirf deal complete hone ke baad** — chat mein "Deal done?" confirm → tabhi review unlock | Abhi koi bhi kisi ko review kar sakta hai = fake ratings | Meetup confirm already hai: `POST /chats/:id/meetup`. Isi ko deal-signal banao | P0 |
| A5 | **Seller response signals (real)** — "Active today", "Usually replies in ~X min", "N deals completed" | C2C ka sabse bada trust signal; abhi tracked hai par UI par nahi | `lastActiveAt` tracked (5-min throttle, `platformBI.js`), chat mein `lastSeenAt` use hota hai | P0 |
| A6 | **"New Seller" label** — account < 30 din ya `soldCount == 0` | Honest disclosure, buyer ko protect karta hai | `soldCount`/`boughtCount` already hain | P1 |
| A7 | **Deal history prominence** — "12 deals completed" + review count profile/card par | Numbers trust banate hain | `soldCount`, `Shop.reviewCount`, `Shop.ratingAverage` | P1 |
| A8 | **Individual seller rating** — abhi reviews mainly shops ke liye; individuals ke liye bhi rating aggregate | Buyer ko seller compare karne ka base mile | `reviews.js` mein `/user/:userId` route already hai | P1 |
| A9 | **First-meet safety popup + in-app-only warning** — pehli baar chat/meet par safety steps | Scam prevention, trust positioning | Safety content already hai (`SafetyScreen`, `legalContent.js`) | P1 |
| A10 | **Profile completeness nudge** — photo, bio, location, phone-verified → "Profile 80% complete" | Incomplete profiles trust todte hain | `User.profileComplete` field exist karta hai | P2 |
| A11 | **Phone number masking default** — jab tak user opt-in na kare, number hide | Scam/leak prevention; already partially implemented | `publicUser()` `preferences.showPhone` respect karta hai | P1 |
| A12 | **Verified badge ko honest rakho** — UI mein "Verified" hardcode na ho | Jhootha badge turant trust todta hai | `SellerProfileScreen.js` `seller.verified` use karta hai — source verify karein | P0 |

---

## B. ENGAGEMENT / RETENTION LOOPS

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| B1 | **Real push notifications (FCM)** — new message, offer, "item sold", system | #1 retention lever. Abhi sirf in-app list hai | Token save hota hai (`POST /auth/device-token`), `fcmToken` on User. **Push sirf calls ke liye hai** (`utils/callPush.js`) | P0 |
| B2 | **Saved searches + new-match alert** — "Mujhe is search ke naye item batao" | Buyer ko sirf tab pata chale jab wapas aaye — ye loop todta hai | `recentSearches.js` (mobile) already saves searches, par alert nahi | P0 |
| B3 | **Price-drop alert** — wishlist item ka price gira to notify | Highest-converting notification type | `wishlist` toggle exists; listing price change par hook chahiye | P0 |
| B4 | **"Item you viewed got sold"** — urgency + FOMO | Fast decision karwata hai | `RecentlyViewedScreen.js` + views tracked (`Listing.views`) | P1 |
| B5 | **Follow store → new listing alert** | Repeat visit ka strong reason | Pinned stores full stack exist (`/auth/pinned-stores`) | P1 |
| B6 | **Recently viewed ko actionable banao** — "price dropped since you viewed" | Dead-end screen ko loop banao | `recentlyViewed.js` + screen exist | P1 |
| B7 | **Trust flywheel: auto review request** — pehli deal ke 24h baad review maango | Reviews badhe → trust badhe → deals badhe | `RateReviewScreen.js` exist; scheduler/trigger chahiye | P0 |
| B8 | **Weekly digest** — "Is hafte aapke area mein 12 naye item" | Re-engagement jab user inactive ho | `platformBI.js` se data nikalta hai | P2 |
| B9 | **Social proof counter** — "500+ deals is mahine Kathmandu mein" | Naye user ko confidence | `platformBI.js` BI already hai | P1 |
| B10 | **Referral ko surface karo** — invite → featured credit | Word-of-mouth growth | Poora referral system exist (`/auth/referral`, `featuredCredits`) | P1 |
| B11 | **Light gamification** — "first sale" badge, "5 deals" milestone, profile strength | Achievement loop wapas laata hai | `soldCount`/`boughtCount` counters | P2 |
| B12 | **Re-engagement for inactive** — 7/14/30 din inactive users ko relevant alert | Churned users wapas | `lastActiveAt` + `platformBI` DAU data | P2 |
| B13 | **Onboarding personalization** — location + interests le kar feed tune karo | Pehla session hi relevant ho | `OnboardingScreen.js`, `CategoryIcon` | P1 |
| B14 | **Empty states ko engaging banao** — "kuch nahi mila" ke bajaye suggestions/alerts offer | Dead-end se bachao | `EmptyStateScreen.js` exist | P2 |

---

## C. RELEVANCE — "SAHI RESULT MILE"

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| C1 | **Ranking improve** — trust boost + freshness decay + distance + seller response rate | Feed relevant aur "interesting" lagegi | `listingTrustBoost` + featured already ranking mein | P0 |
| C2 | **Freshness decay** — purane listings niche, naye upar | Stale feed user ko bore karta hai | `createdAt` index exist | P0 |
| C3 | **Distance weight ranking mein** — nearby items prefer | Local marketplace ka core value | Haversine already (`utils/listing.js`) | P1 |
| C4 | **Search relevance tuning** — synonyms, buyer phrases | User jo type kare wo mile | `searchMatch.js` + `Listing.searchWords` exist | P1 |
| C5 | **Seed listings (100–200)** — launch ke liye catalog | Naya user ko kuch na mile = instant churn | Sirf `seedAdmin.js` hai; seed listings script nahi | P0 |
| C6 | **Personalized home feed** — interests, viewed categories, location | Har user ko apna relevant feed | `homeListingsCache.js`, `preferences` exist | P1 |
| C7 | **Category/city based trending** — "Kathmandu mein trending" | Discovery improve | `GET /listings/category-counts` exist | P2 |

---

## D. SAFETY & ANTI-FRAUD

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| D1 | **Duplicate listing detection** — same title/photo/price | Spam control, trust | `listingSpamGuard.js` exist — extend karo | P1 |
| D2 | **New-seller listing approval** — pehli 1–2 listings admin review | Fraud prevention at launch | `Listing.status: pending` + moderation already hai | P1 |
| D3 | **Safe meetup points per city** — curated POI list (police station, mall, cafe) | Safety positioning | Abhi sirf enum option hai (`meetupOption`) | P1 |
| D4 | **Report queue action speed** — SLA + auto-action on N reports | Reported content lamba zinda na rahe | `reports.js` admin routes exist | P1 |
| D5 | **Auto chat restriction** — abuse filter ke basis par | Harassment rokna | `chatAbuseFilter.js` + `chatRestrictedUntil` exist | P2 |
| D6 | **Restricted keyword list maintain** — scam words ("advance payment", "courier") | Advance-fee scams | `RestrictedKeyword` model + admin UI exist | P1 |
| D7 | **Blocked user propagation** — block karne par listings/chat dono se hide | Safety consistency | `blockedUserIds` on User | P2 |
| D8 | **NSFW / illegal item auto-detect** | Platform legal risk | `nsfwImageCheck.js`, `imageSafetyCheck.js` exist | P1 |

---

## E. QUALITY / INFRA (Trust ke blockers — fix warna sab bekaar)

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| E1 | **Broken images fix** — purani listings local `file://` URI par hain | Dusre device par image broken = instant trust loss | R2 cloud upload exist (`utils/r2.js`), purane records migrate karne hain | P0 |
| E2 | **Null coordinates fix** — create par GPS lat/lng save | Distance/nearby filter kaam nahi karta warna | `Listing.coordinates` exist; mobile se save karna hai | P0 |
| E3 | **True geo index (`2dsphere`)** | City-scale par nearby fast ho | Abhi in-memory haversine filter | P1 |
| E4 | **WebSocket chat** (ya long-poll) | Polling (4s) scale par load + slow feel | `ChatScreen.js` polling | P1 |
| E5 | **JWT refresh + rotation** | Single 7-day token stolen reh jata hai | `utils/token.js` — refresh nahi | P0 |
| E6 | **Rate limiting (esp. OTP)** | Bot abuse + SMS cost | `express-rate-limit` installed nahi | P0 |
| E7 | **CORS lockdown + HTTPS-only** | Abhi `origin: '*'` + cleartext Android | `Backend/src/app.js` | P0 |
| E8 | **DB backups automated** | Data loss risk | N/A | P0 |
| E9 | **Error monitoring** — verify Sentry live hai | Silent prod bugs | `utils/monitoring.js` already exists | P1 |
| E10 | **Load testing** | Launch-day crash | N/A | P2 |

---

## F. PRIORITY MATRIX (Kya pehle)

### Phase 1 — Trust foundation + launch blockers
A1, A2, A3, A4, A12, E1, E2, E5, E6, E7, E8, C5

### Phase 2 — Engagement loop (wapas laao)
B1, B2, B3, B7, C1, C2, A5, A6, B9

### Phase 3 — Depth (trust + relevance)
A7, A9, A10, A11, B4, B5, B6, B10, B13, C3, C4, C6, D1–D8, E3, E4

### Phase 4 — Growth polish
B8, B11, B12, B14, C7, E9, E10

---

## G. Recommended "Sahi Result" Sequence

```
1. Honest badges (A1+A2+A3)        → trust signals real ho jayen
2. Deal-gated reviews (A4)         → fake ratings khatam
3. Seller signals (A5)             → buyer ko decision ka data
4. Ranking: trust+freshness+near   → feed relevant (C1+C2+C3)
5. Real push (B1) + price drop (B3) + saved search (B2) → wapas aane ki wajah
6. Review flywheel (B7)            → ratings → trust → deals → repeat
```

**Impact logic (chain):** Honest trust signals → buyer bharosa → zyada chat/deals → seller ko orders → seller active rehta hai → fresh listings → buyer ko relevant results → loop repeat.

---

## H. Existing Hooks Quick Map (kya already bana hua hai)

| Capability | File / Route | Status |
|-----------|--------------|--------|
| Verification (shop) | `Shop.isVerified`, `verificationStatus`, admin PATCH | Done |
| Verification (individual) | — | **Missing** |
| Trust boost ranking | `utils/listing.js` → `listingTrustBoost` | Exists (differentiation weak) |
| Last active tracking | `utils/platformBI.js`, `chatController.js` | Done (UI par expose nahi) |
| Meetup confirm | `POST /chats/:id/meetup` | Done |
| Reviews | `routes/reviews.js` | Done (deal-gating missing) |
| Wishlist | `routes/wishlist.js`, `WishlistContext.js` | Done |
| Pinned stores | `/auth/pinned-stores`, `pinnedStores.js` | Done |
| Recently viewed | `utils/recentlyViewed.js`, `RecentlyViewedScreen.js` | Done (dead-end) |
| Referral + featured credits | `utils/referral.js`, `/auth/referral` | Done |
| Push infra (calls only) | `utils/callPush.js`, `pushAlerts.js` | Partial |
| FCM token | `POST /auth/device-token`, `User.fcmToken` | Done |
| Cloud uploads | `utils/r2.js` | Done |
| NSFW / keyword moderation | `nsfwImageCheck.js`, `moderation.js` | Done |
| Spam guard | `listingSpamGuard.js` | Done |
| Shop analytics | `shopAnalytics.js`, `ShopAnalyticsDaily` | Done |
| Storefront QR / banner PDF | `storefrontBannerPdf.js`, `/shops/mine/storefront` | Done |
| AI listing auto-fill | `utils/aiSuggest.js`, `/ai/listing-suggest` | Done |
| BI / DAU | `utils/platformBI.js` | Done |
| Error monitoring | `utils/monitoring.js` (Sentry) | Done |
| Rate limiting | — | **Missing** |
| JWT refresh | — | **Missing** |
| Geo index (`2dsphere`) | — | **Missing** |
| Seed listings script | — | **Missing** |

---

# PART 2 — ADVANCED LEVEL

> Ye **longer-horizon / advanced** layer hai. Part 1 (A–H) basics + launch blockers the; ye woh features hain jo app ko **market leader level** par le jate hain — composite trust score, ML-driven personalization, fraud-ring detection, aur revenue loops.
>
> Advanced items ko **Part 1 ke P0 done hone ke baad** uthana chahiye, warna data/feedback loop hi nahi banega.

---

## I. ADVANCED TRUST SYSTEMS

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| AT1 | **Composite Trust Score (0–100)** — weighted model: verification tier, completed deals, response rate, dispute rate, account age, review quality, report count | Ek number jo buyer ko turant samajh aaye; ranking ka single input | `soldCount`, `boughtCount`, `ratingAverage`, `lastActiveAt`, `Report` — sab data maujood hai | P1 |
| AT2 | **Two-sided reputation** — buyer, seller ko rate kare **aur** seller, buyer ko | Marketplace balance; time-waster buyers bhi filter honge | `Review` model mein direction field add karna hoga | P1 |
| AT3 | **Deal ledger (proof of completed deals)** — dono side "deal done" confirm → immutable record | Reviews ka legit base; "N verified deals" badge | `POST /chats/:id/meetup` ko deal state machine banao | P1 |
| AT4 | **Meetup QR check-in** — meet par dono QR scan → in-person proof | Sabse strong anti-fake signal (online-only fraud khatam) | **Storefront QR infra already hai** (`/shops/mine/storefront/qr.png`, `react-native-qrcode-svg`) | P2 |
| AT5 | **Progressive trust gating** — naye account par limits: max 2 listings/day, phone reveal N deals ke baad, chat rate limit | Fraud ko costly banata hai bina genuine users rokne ke | `listingSpamGuard.js`, `chatRestrictedUntil` exist | P1 |
| AT6 | **Dynamic earned badges** — "Fast responder (<1h)", "Top rated", "10+ deals", "Verified ID" | Badges mehnat se milti hain → value real | `platformBI` + `Message` timestamps se compute | P1 |
| AT7 | **Trust transparency panel** — "Kya verify hua, kab hua" list dikhao | Blanket "Verified" se zyada bharosa deta hai | `verificationStatus`, `verificationSubmittedAt` | P2 |
| AT8 | **Trust decay** — inactive ya failed deals se score girta hai | Purani fake reputation zinda na rahe | Score job/scheduler chahiye | P2 |
| AT9 | **Dispute center** — evidence upload, both-side statements, admin verdict, score impact | Escalation ka structured rasta; trust recover hota hai | `Report`, `SupportTicket`, `PlatformAlert` models exist | P2 |
| AT10 | **Appeal flow** — suspend/restrict par user appeal kar sake | Injustice se churn rokta hai; ops fair lagega | `User.status`, `chatRestrictedUntil` | P2 |
| AT11 | **Device & identity graph** — device fingerprint, phone/IP reuse, multi-account detection | Fraud rings pakadne ka core | Naya | P2 |
| AT12 | **Perceptual photo hash (pHash)** — duplicate/stolen images detect | Scam listings ki sabse common trick | `sharp` already hai (pHash compute ho sakta hai) | P2 |
| AT13 | **Community moderation tiers** — high-trust users "community reviewer" ban jayen | Moderation scale ho jata hai; users ko status milta hai | Admin `moderation.js` + roles already | P3 |
| AT14 | **Badge revocation + audit log** | Verification jhooti nikle to badge hat sake, record rahe | Naya (audit collection) | P2 |
| AT15 | **KYC-lite (Nepali citizenship/ID) partner integration** | Highest trust tier; payouts ke liye bhi zaroori | Individual verification flow (A2) ka next step | P3 |
| AT16 | **Panic / live-location share during meetup** — trusted contact ko live location | Safety positioning ka strongest feature; PR value | `expo-location`, `Share` infra exist | P2 |

---

## J. ADVANCED ENGAGEMENT & GROWTH

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| AG1 | **Structured Offers system** — "Make offer / counter / accept / decline" | Chat mein price talk unstructured hai; offers se conversion + data milta hai | `Message` model mein naya message type; `negotiable` concept add karna | P1 |
| AG2 | **Notification orchestration layer** — frequency cap, quiet hours, dedup, priority tiers | Notification spam = uninstall; smart sending = retention | `pushAlerts.js`, `notificationController.js` | P1 |
| AG3 | **Channel fallback** — Push → WhatsApp/Viber → SMS (Nepal context) | Push off hone par bhi user reach ho | Naya (WhatsApp Business API) | P2 |
| AG4 | **Best-time-to-notify** — user ke `lastActiveAt` pattern se personal send time | Same notification, zyada CTR | `platformBI` DAU data | P2 |
| AG5 | **"X log ye item dekh rahe hain"** — live concurrency signal | Urgency + FOMO → fast decision | `Listing.views` exist; live counter chahiye (Redis) | P2 |
| AG6 | **Live activity ticker** — city mein recent deals/saves feed | App "zinda" lagta hai; social proof | `platformBI`, `ShopAnalyticsDaily` | P2 |
| AG7 | **Escalating re-engagement ladder** — 3/7/14/30 din, har step alag message | Ek generic blast se kaafi better | `lastActiveAt` + scheduler | P2 |
| AG8 | **Referral 2.0** — two-sided reward, tiers, leaderboard, fraud checks | Growth engine; abhi one-sided | Pooora referral system exist (`referral.js`) | P2 |
| AG9 | **Seller growth loop** — "1 hour mein reply karo → 24h free boost" | Response rate badhta hai = trust aur engagement dono | `featuredUntil`, `featuredCredits` exist | P2 |
| AG10 | **Deep links + share attribution** — har listing share ka source track | Viral loop kaaran ka pata chalta hai | `ListingShareCard.js`, `shareListingCard.js`, `listingShare.js` exist | P1 |
| AG11 | **Web ↔ App continuity** — storefront/listing web par khule → app open deep link | Website (SEO traffic) ko app install mein convert | `Website/src/pages/*` + `/listing/:id`, `/seller/:id` exist | P2 |
| AG12 | **Follow store (real)** — `followersCount` field hai, par follow API nahi | Repeat buyer ko new-listing alert | `Shop.followersCount` exist, API **missing** | P1 |
| AG13 | **Seasonal / local campaigns** — Dashain, Tihar, city-specific drives | Nepal market ka natural engagement spike | `notificationController` broadcast exist | P2 |
| AG14 | **Collections / curated lists** — "Kathmandu mein best value phones" | Discovery + editorial voice | `listingQueryCache`, categories exist | P3 |
| AG15 | **Reviews with photos + Q&A on listing** | Content depth + SEO + trust | `Review` model extend; `Website` listing page | P3 |
| AG16 | **Daily/weekly micro-goals + streaks** — "Is hafte 1 item post karo" | Habit loop | `soldCount`, credits infra | P3 |

---

## K. ADVANCED PERSONALIZATION / ML

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| AM1 | **Learning-to-rank feed** — implicit signals (impression, dwell, save, chat, deal) | Feed sach mein "interesting" lagegi, guesswork nahi | `homeListingsCache.js`, `platformBI` | P2 |
| AM2 | **Event pipeline** — impression/click/dwell/save/deal events collect karo | Har ML/E-A-B ka fuel; abhi data nahi | Naya (`ErrorEvent` pattern follow kar sakte hain) | P1 |
| AM3 | **Item embeddings → similar items** | "Related" abhi rule-based hai; embeddings better | `getRelatedListings` exist | P2 |
| AM4 | **Search understanding** — typos, romanized Nepali, synonyms | Nepal mein users "mobile", "mobail", "set" likhte hain | `searchMatch.js`, `Listing.searchWords` | P1 |
| AM5 | **Search by photo** — image upload → matching listings | AI infra already hai; killer differentiator | `aiSuggest.js`, `nsfwImageCheck.js` (vision pipeline) | P3 |
| AM6 | **Price intelligence** — category-wise fair price range, "good deal" chip | Buyer decision + trust ("yahi market rate hai") | `Listing.price`, `category-counts` | P2 |
| AM7 | **Seller-buyer match score** — distance + category affinity + past chats | Personal discovery | `chatController`, geo utils | P3 |
| AM8 | **Churn propensity model** — kaun churn karega → targeted save | Retention spend efficient ho jata hai | `lastActiveAt`, DAU | P3 |
| AM9 | **Fraud propensity model** — listing/user risk score | Manual moderation ka load kam | `listingSpamGuard`, `imageSafetyCheck` | P2 |
| AM10 | **Cold-start handling** — onboarding interests + geo prior se feed seed karo | Pehla session hi relevant | `OnboardingScreen`, `preferences` | P1 |

---

## L. ADVANCED DATA & INFRASTRUCTURE

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| AD1 | **Dedicated search engine** (Meilisearch / Typesense / Elasticsearch) | Mongo regex/text search scale par slow + weak | `searchMatch.js`, `Listing` text index | P2 |
| AD2 | **Redis layer** — hot listings, presence, rate-limit counters, live view counts | DB load kam; AG5/AG6 enable ho jate hain | `listingQueryCache.js` (in-memory) → Redis upgrade | P1 |
| AD3 | **Realtime streaming** (Redis Streams / Socket.io) — chat, presence, notifications | Polling (4s) ka end; AG5 realtime banega | `ChatScreen.js` polling | P1 |
| AD4 | **Image derivative pipeline** — thumbnails, WebP/AVIF, responsive variants | Mobile data bachta hai (Nepal context) + fast loads | `sharp`, `compressMedia.js`, R2 | P1 |
| AD5 | **CDN for media** | Global-ish fast loads, R2 se offload | R2 exist | P1 |
| AD6 | **Event warehouse + dashboards** | BI, cohort, funnel (view→chat→deal) | `platformBI.js`, `ShopAnalyticsDaily` | P2 |
| AD7 | **Feature store** | ML features reuse (trust score, ranking) | Naya | P3 |
| AD8 | **Read replicas + sharding plan** | Scale readiness | MongoDB Atlas | P3 |
| AD9 | **SLOs + alerting + tracing** | Silent failures pakadna | Sentry exist (add APM/traces) | P2 |
| AD10 | **Offline-first mobile** — message queue, optimistic UI, retry | Nepal mein network flaky hai | `api.js` retry logic exist, offline queue nahi | P2 |

---

## M. ADVANCED SAFETY & FRAUD

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| AS1 | **Fraud ring detection** — shared device/phone/IP/bank ke clusters | Organized scam groups pakadna | AT11 device graph ke saath | P2 |
| AS2 | **Advance-fee scam intent detection** — chat mein "advance payment", "courier bhejo" patterns | Nepal mein sabse common scam | `chatAbuseFilter.js` → intent model upgrade | P1 |
| AS3 | **Scam pattern library + reporting network** — jaise-jaise scam aaye, rules update ho | Time ke saath system smarter | `RestrictedKeyword` admin UI exist | P2 |
| AS4 | **Escalation ladder automation** — warn → restrict → suspend → ban (evidence ke saath) | Consistent enforcement | `chatRestrictedUntil`, `User.status` | P1 |
| AS5 | **Moderation queue with SLA + reviewer quality scoring** | Reports jaldi aur sahi handle hon | Admin `Reports.jsx`, `moderation.js` | P2 |
| AS6 | **Trusted meetup partner program** — mall/cafe/police station verified POIs | Safety positioning + partnerships | D3 ka advance | P3 |
| AS7 | **Content provenance** — photo internet par kahin aur se uthi hai kya (reverse check) | Stolen photos se fake listings | AT12 pHash + external check | P3 |
| AS8 | **Transparency reports** — kitne report/action, public summary | Press/regulator trust, PR value | `ErrorEvent`, `Report` data | P3 |
| AS9 | **Shadow-ban** — repeat offenders ka content sirf unhe dikhe | Spam ke bina conflict | Ranking layer | P3 |
| AS10 | **Age/illegal item compliance checklist** | Legal risk | `nsfwImageCheck`, `imageSafetyCheck` | P2 |

---

## N. ADVANCED OPS & EXPERIMENTATION

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| AO1 | **Feature flags + remote config** | Deploy ke bina feature on/off, copy change | Naya | P1 |
| AO2 | **A/B testing framework** | "Guess" ki jagah measure | Naya | P2 |
| AO3 | **Metrics tree + North Star** — North Star = *completed deals per week* | Sab team ek hi metric ki taraf | `platformBI.js` | P1 |
| AO4 | **Funnel analytics** — view → save → chat → meetup → deal | Kahan drop ho raha hai wo dikhta hai | `Message`, `views`, `meetup` data | P1 |
| AO5 | **Support agent console (User 360 view)** | Ticket resolution fast; trust | `SupportTicket`, admin panel | P2 |
| AO6 | **Moderation playbooks + quality scoring** | Consistent decisions | Admin pages exist | P2 |
| AO7 | **Incident runbooks + status page** | Outage par trust bacha rehta hai | `PlatformAlert` model exist | P2 |
| AO8 | **Cohort retention dashboards** | Retention trend pata chale | `platformBI` DAU | P2 |

---

## O. ADVANCED BUSINESS / MONETIZATION (engagement ka fuel)

| # | Kya handle karna hai | Kyun / Impact | Existing hook | Priority |
|---|---------------------|---------------|---------------|----------|
| AB1 | **Paid listing boosts / prominence auction** | Revenue + sellers ko results | `featuredUntil`, `featureListingWithCredit` exist | P1 |
| AB2 | **Shop subscription** — featured storefront, analytics pro, bulk upload | Recurring revenue | `ShopAnalyticsDaily`, `ShopDashboard` exist | P2 |
| AB3 | **Pay-per-verified-lead for shops** | Shops ko measurable ROI | `ShopAnalyticsDaily`, chat data | P3 |
| AB4 | **Delivery/logistics partner integration** | Delivery = bigger market | Naya (`meetupOption` ke saath) | P3 |
| AB5 | **Escrow / buyer protection (partner ke saath)** | Trust + transaction value badhta hai | Wallet UI exist | P3 |
| AB6 | **Local business ads** | Extra revenue stream | `notificationController`, `PlatformAlert` | P3 |
| AB7 | **Shop insights product** — "aapke category mein demand kya hai" | Shops ko value, retention | `shopAnalytics.js` | P3 |
| AB8 | **Creator/curator program** — collections banane walon ko reward | Content engine | AG14 | P3 |

---

## P. MATURITY LEVELS (kahan se kahan)

| Level | Naam | Kya hona chahiye | Items |
|-------|------|------------------|-------|
| **L1** | **Functional MVP** (aaj) | Browse, post, chat, meetup — par trust signals fake aur koi retention loop nahi | Part 1 (A–E) |
| **L2** | **Trustworthy** | Honest badges, composite trust score, deal-gated reviews, real seller signals | AT1–AT8, A1–A6 |
| **L3** | **Engaging** | Push, offers, saved-search/price-drop alerts, follow, review flywheel, relevance ranking | AG1–AG13, B1–B13, C1–C6 |
| **L4** | **Intelligent** | Event pipeline, learning-to-rank, search quality, churn/fraud models, notifications orchestration | AM1–AM10, AG2–AG4, AO3–AO4 |
| **L5** | **Ecosystem** | Fraud-ring detection, KYC, escrow/delivery, subscriptions, paid boosts, credibility partner programs | AS1–AS10, AB1–AB8, AT13–AT16 |

---

## Q. ADVANCED PRIORITY ORDER (L2 → L5)

```
L2 (Trustworthy):
  AT1 Trust Score → AT3 Deal ledger → AT2 Two-sided reviews
  → AT5 Progressive gating → AT6 Earned badges → AT11 Device graph

L3 (Engaging):
  AG1 Offers → AG12 Follow store → AG10 Deep links
  → AD2 Redis → AG2 Notification orchestration → AG9 Seller growth loop

L4 (Intelligent):
  AM2 Event pipeline → AO4 Funnel → AM1 Learning-to-rank
  → AM4 Search understanding → AM8 Churn model → AG4 Best-time notify

L5 (Ecosystem):
  AS1 Fraud rings → AT15 KYC-lite → AB1 Paid boosts
  → AB2 Shop subscription → AB4 Delivery partner → AT16 Panic/live-location
```

**Advanced North Star:** *Verified deals per week* (ek metric jisme trust + engagement + revenue teeno mil jate hain).

---

*Is document ko update karte raho jab bhi koi item Done ho.*
