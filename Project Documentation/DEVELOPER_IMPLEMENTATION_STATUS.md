# KinBech — Developer Implementation Status

**Purpose:** Ek hi document jisse naye developers turant samajh sakein — kya **complete** hai, kya **partial** hai, aur kya **baki** hai.  
**Last reviewed:** September 2026  
**Related docs:** `1. Production_Readiness_Report.pdf`, `2. Launch_Trust_Strategy.pdf`, `3. Automation_Shop_Management.pdf`

---

## Quick Summary

| Layer | Status | Notes |
|-------|--------|-------|
| **Mobile (Expo)** | ~75% MVP | Auth, listings, explore, chat, profile, shops — usable |
| **Backend (Express + MongoDB)** | ~70% MVP | Core APIs done; production hardening missing |
| **Admin (Vite + React)** | ~65% | Real APIs connected; some UI still static/mock |
| **Production / Launch readiness** | ~25% | Security, CDN, monitoring, automation mostly pending |

**Bottom line:** App **local dev mein chal sakti hai** as a marketplace MVP. **Public launch** ke liye PDF 1 (security + infra) aur PDF 2 (trust + seed content) ke kaafi items ab bhi pending hain.

---

## Scorecard (3 PDF Roadmaps)

| Source PDF | Done | Partial | Not started |
|------------|------|---------|-------------|
| **1. Production Readiness** | 3 | 4 | 8 |
| **2. Launch & Trust** | 1 | 6 | 3 |
| **3. Automation & Shop** | 0 | 3 | 3 |

Legend: **Done** = end-to-end usable · **Partial** = UI/field exists but incomplete · **Not started** = no meaningful implementation

---

## Part A — Kya COMPLETE Hai

### Mobile App (`Mobile/src/`)

| Feature | Screens / Files | Backend |
|---------|-----------------|---------|
| Phone OTP login/signup | `LoginScreen`, `OtpVerificationScreen`, `SignupScreen` | `POST /auth/login`, `/signup`, `/otp` |
| Profile setup (individual + shop) | `ProfileSetupScreen`, `CreateShopScreen`, `SellerTypeSelectionScreen` | `PATCH /auth/me`, `POST /shops` |
| Home + categories | `HomeScreen`, `CategoryIcon`, `AllCategoriesScreen` | `GET /categories`, `GET /listings` |
| Explore + seller discovery | `ExploreScreen`, `SellerProfileScreen` | `GET /sellers/featured`, `/popular`, `/nearby`, `/search` |
| Search + filters | `SearchResultsScreen`, `FilterBottomSheet` | `GET /listings/search` |
| Listing detail + gallery | `ItemDetailScreen` | `GET /listings/:id` |
| Post listing (individual + shop) | `IndividualPostListingScreen`, `ShopPostListingScreen` | `POST /listings` |
| Edit / my listings | `EditListingScreen`, `MyListingsScreen` | `PUT /listings/:id`, `GET /listings/mine` |
| Chat (REST + polling) | `ChatListScreen`, `ChatScreen` | `GET/POST /chats`, `/chats/:id/messages` |
| Meetup confirmation | `MeetupConfirmationScreen` | `POST /chats/:id/meetup` |
| Wishlist | `WishlistScreen` | `GET/POST /wishlist` |
| Reviews (shops) | `RateReviewScreen`, `ShopProfileScreen` | `POST /reviews` |
| Report / block user | `ReportBlockUserScreen` | `POST /reports`, block routes |
| Profile, settings, privacy | `ProfileScreen`, `SettingsScreen`, `PrivacyScreen` | `GET/PATCH /auth/me`, `/auth/preferences` |
| Wallet, addresses, payments (UI) | `WalletScreen`, `SavedAddressesScreen`, `PaymentMethodsScreen` | `GET /auth/wallet`, `/addresses`, `/payment-methods` |
| Support / contact | `ContactUsScreen`, `HelpSupportScreen` | `POST/GET /auth/support` |
| Terms & Privacy (static) | `TermsScreen`, `PrivacyPolicyScreen` | — |
| Pull-to-refresh (major screens) | `hooks/usePullRefresh.js` | — |
| Location (city + district) | `utils/locations.js`, profile/home screens | reverse geocode on device |

### Backend (`Backend/src/`)

| Area | Routes / Files |
|------|----------------|
| Auth + JWT | `routes/auth.js`, `controllers/authController.js`, `utils/token.js` |
| Users, preferences, wallet, addresses | `authController.js`, `models/User.js` |
| Listings CRUD + search + distance | `routes/listings.js`, `controllers/listingController.js`, `utils/listing.js` |
| Categories (admin + public) | `routes/categories.js`, `models/Category.js`, `utils/categoryDefaults.js` |
| Shops | `routes/shops.js`, `controllers/shopController.js`, `models/Shop.js` |
| Sellers API | `routes/sellers.js`, `controllers/sellerController.js` |
| Chats + meetup | `routes/chats.js`, `controllers/chatController.js`, `models/Chat.js` |
| Notifications (in-app) | `routes/notifications.js`, `models/Notification` usage |
| Reviews + reports | review/report controllers + models |
| Admin stats + moderation | `GET /auth/admin/dashboard-stats`, listing/shop/user admin PATCH routes |
| Static uploads (categories) | `app.js` → `/uploads`, `routes/categories.js` upload |
| Phone privacy default | `publicUser()` hides phone unless `preferences.showPhone` |

### Admin Panel (`Admin/src/`)

| Page | API Connected |
|------|---------------|
| Dashboard | `GET /auth/admin/dashboard-stats` |
| Users | `GET/PATCH /auth/admin/users` |
| Listings | `GET /listings/admin/all`, status PATCH |
| Shops | `GET /shops/admin/all`, verify/status PATCH |
| Categories | CRUD + image upload |
| Reports, Reviews, Notifications | Live admin routes |
| Login | `POST /auth/admin/login` |

### Dev Tooling

| Item | Location |
|------|----------|
| Run all (backend + admin) | Root `npm run dev` |
| Makefile (install, mongo) | `Makefile` |
| Seed admin user | `Backend/src/seedAdmin.js` → `npm run seed:admin` |
| Default admin | `admin@kinbech.com` / `admin123` (see root `README.md`) |

---

## Part B — Kya PARTIAL Hai (Kaam Chal Raha Hai, Par Production-Ready Nahi)

| Item | Kya Hai | Kya Missing |
|------|---------|-------------|
| **Listing photos** | Mobile picks images → often `file://` URI in DB | Cloud upload (S3/R2), CDN, server-side storage |
| **Distance / nearby** | Haversine in JS; `distanceKm` on cards | MongoDB `2dsphere`; many listings have null coords |
| **Geospatial search** | `lat/lng/radius` query params | In-memory filter after `.limit(300–500)` — slow at scale |
| **Pagination** | Hard limits (300/500) on listings | Proper `page`/`cursor` API + infinite scroll |
| **Chat** | REST works; poll every ~4s in `ChatScreen.js` | WebSocket / Socket.io |
| **Notifications** | In-app list + DB records | Push (FCM / `expo-notifications`); no price-drop triggers |
| **Verification badges** | Shop `isVerified` + admin approve | Individual seller verification; some UI hardcodes "Verified" |
| **New seller label** | "New Shop" if no reviews | No backend "New Seller" by age/listing count |
| **Safe meetup** | Meetup option on listing; saved addresses | No curated safe POI list / map API |
| **Hyperlocal** | GPS + city/district on home/profile | Not true geo-indexed; Kathmandu fallback |
| **Active seller signals** | Green dot UI (decorative) | No `lastActive` / response-time metrics |
| **Stock / inventory** | `stock`, `sku`, `brand` on listing model + shop post form | No stock dashboard; no auto-decrement on sale |
| **Purchases history** | `GET /listings/purchases` (chat/meetup heuristic) | Not real order lifecycle |
| **MongoDB Atlas** | `MONGODB_URI` supported in `.env` | Local mongo default in Makefile; no enforced prod config |
| **Admin dashboard** | Real stats API | Some badges/trends still hardcoded in `Layout.jsx` / `Dashboard.jsx` |
| **Reviews workflow** | Reviews created | Default `pending`; limited auto-moderation |
| **Multi-language / currency** | Settings screens exist | May not be fully wired to all content |

---

## Part C — Kya BAKI Hai (Not Started)

### PDF 1 — Production Readiness (Priority)

| # | Item | Why It Matters |
|---|------|----------------|
| 1 | **JWT refresh + rotation** | Single 7-day token; stolen token stays valid |
| 2 | **Rate limiting** (especially OTP) | Bot abuse / SMS cost |
| 3 | **Cloud image storage + CDN** | Disk full, slow loads, broken images off-device |
| 4 | **Sentry / error monitoring** | Silent prod bugs |
| 5 | **CI/CD pipeline** | Safe deploys + rollback |
| 6 | **Automated DB backups** | Data loss risk |
| 7 | **Keyword / NSFW moderation** | Illegal/spam content at scale |
| 8 | **WebSocket chat** | Server load from polling |
| 9 | **Load testing** | Launch-day crash risk |
| 10 | **SMS provider fallback** | OTP outage = app down |
| 11 | **New seller listing approval** | Fraud prevention (PDF 1) |
| 12 | **Review only after transaction** | Fake ratings |
| 13 | **CORS lockdown + HTTPS-only mobile** | `origin: '*'` + cleartext Android today |

### PDF 2 — Launch & Trust

| # | Item | Why It Matters |
|---|------|----------------|
| 1 | **Seed listings (100–200)** | Chicken-and-egg at launch |
| 2 | **Referral program** | Word-of-mouth growth |
| 3 | **WhatsApp / Viber support line** | Trust + dispute handling in Nepal |
| 4 | **Phone Verified / Business Verified badges** (consistent) | Search ranking + trust |
| 5 | **First-transaction safety popup** | Scam prevention |
| 6 | **City-wise safe meetup points** | Safety positioning |
| 7 | **Referral + featured listing reward** | Seller acquisition |
| 8 | **Weekly digest / re-engagement push** | Retention |
| 9 | **Social proof counter** ("500+ deals") | New user confidence |

### PDF 3 — Automation & Shop Management

| # | Item | Why It Matters |
|---|------|----------------|
| 1 | **Shop stock dashboard** | Shop sellers need inventory view |
| 2 | **Bulk upload (CSV/Excel)** | Large catalogs |
| 3 | **Order model + tracking** | Pending / completed / repeat buyer |
| 4 | **Shop reports** (sales, conversion, top items) | Business retention |
| 5 | **Low-stock / out-of-stock auto-hide** | Customer trust |
| 6 | **Auto-review request (24h post deal)** | Rating volume |
| 7 | **Duplicate listing detection** | Spam control |
| 8 | **Admin anomaly alerts** | Ops at scale |

---

## Recommended Build Order (Naye Developer Ke Liye)

### Phase 1 — Launch blockers (2–4 weeks)
1. Cloud image upload (listings + avatars)  
2. Rate limiting on auth endpoints  
3. JWT refresh tokens + shorter access token  
4. Sentry on Backend + Mobile  
5. MongoDB Atlas + backup policy  
6. Fix listing coordinates on create (GPS → save lat/lng)  

### Phase 2 — Trust at launch (1–2 weeks)
1. Verification badges (individual + shop) — backend flags + honest UI  
2. New Seller label (account age / zero sales)  
3. Safe meetup points (static JSON per city to start)  
4. Seed listings script  
5. WhatsApp support link on Help / Contact  

### Phase 3 — Scale & shop tools (ongoing)
1. WebSocket chat  
2. Push notifications  
3. Shop inventory dashboard + reports  
4. Content moderation (keywords + report queue)  
5. CI/CD  

---

## Key Paths Cheat Sheet

```
KinBech/
├── Backend/src/
│   ├── app.js                 # Express app, CORS, /uploads
│   ├── routes/                # auth, listings, shops, chats, sellers, categories
│   ├── controllers/           # Business logic
│   ├── models/                # User, Listing, Shop, Chat, Category, Report
│   └── utils/listing.js       # Distance, public listing shape
├── Mobile/src/
│   ├── screens/               # All app screens
│   ├── services/api.js        # API client + retries
│   ├── navigation/            # AppNavigator, routes
│   └── utils/listing.js       # Card mapping, distance on client
├── Admin/src/
│   ├── pages/                 # Dashboard, Users, Listings, Shops, Categories...
│   └── services/api.js        # Admin API client
└── Project Documentation/     # PDF roadmaps + this file
```

### Run locally
```bash
# Terminal 1 — Backend (port 5001)
cd Backend && npm run dev

# Terminal 2 — Admin (port 5173)
cd Admin && npm run dev

# Terminal 3 — Mobile (Expo)
cd Mobile && npx expo start
```

Mobile API host: set `EXPO_PUBLIC_DEV_API_HOST` in `Mobile/.env` to your machine LAN IP (same Wi‑Fi as phone).

---

## Known Gaps / Misleading Docs

| Doc says | Reality (Sept 2026) |
|----------|---------------------|
| `README.md`: "Admin uses mock data" | **Outdated** — Admin mostly uses live APIs now |
| `README.md`: "Real-time chat" | **Polling**, not WebSocket |
| `PROJECT_REPORT.md`: Push notifications | **Not implemented** (in-app only) |
| `PROJECT_REPORT.md`: Inventory management | **Fields exist**; no dashboard or automation |
| Listing photos in production | Often **local URIs** — broken on other devices |

---

## How This Maps to PDFs

| PDF | Focus | Start here in codebase |
|-----|-------|------------------------|
| **1. Production Readiness** | Security, scale, moderation, legal, infra | `Backend/src/app.js`, `authController.js`, `listingController.js` |
| **2. Launch & Trust** | Badges, onboarding, seed content, support | `ProfileSetupScreen.js`, `ItemDetailScreen.js`, `ContactUsScreen.js` |
| **3. Automation & Shop** | Stock, orders, reports, automation | `Shop.js`, `ShopPostListingScreen.js`, new shop dashboard routes |

---

## Contact for Handoff

- **Architecture:** Monorepo — Mobile (Expo 57) + Backend (Express) + Admin (Vite)  
- **Database:** MongoDB (local dev or Atlas via env)  
- **Auth:** Phone OTP → JWT (7d, no refresh yet)  
- **Market:** Nepal (+977), NPR, city/district location  

*Is document ko update karte raho jab bhi major feature ship ho — especially "Partial" → "Done" transitions.*
