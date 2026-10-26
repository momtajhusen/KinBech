# KinBech — Platform Trust Plan (v2, code ke saath verify kiya hua)

**Topics:** Deal tracking · Seller Trust Score · Individual vs Store · Auto-Hide · Admin Panel · Launch Checklist
**Last updated:** 25 Oct 2026
**Base:** Claude wala "Platform Trust Plan — Final Document" + KinBech ka asli code (Backend, Mobile, Website/admin).

> Ye document `Trust_And_Engagement_Roadmap.md` ke **Trust (A), Safety (D) aur Advanced Trust (I)** hisson ki jagah leta hai. Engagement, relevance aur growth wale items wahin rahenge.

**Status ka matlab:**
- **Hai** = code mein bana hua aur chal raha hai
- **Aadha** = kuch hissa bana hai, baaki banana hai
- **Nahi** = abhi code mein nahi hai

---

## Is document mein kya hai

1. Quick summary aur 4 sabse bade niyam
2. Abhi code mein kya hai (reality check)
3. Individual seller vs Store seller
4. Deal flow: chat → meetup → deal complete (sabki neev)
5. Store ke liye quantity-based logic
6. Individual seller ka Auto-Hide
7. Seller Trust Score aur ranking
8. Item aur seller ko trustable banana
9. Admin panel
10. Data model, jobs aur config
11. Notification ke niyam
12. Banane ka order
13. Success metrics aur guardrails
14. Launch Checklist (P0 se P4), status ke saath
15. Privacy aur legal
16. Faisle jo aapko lene hain

---

## 1. Quick summary

**Asli problem:** seller item bech deta hai par Sold mark nahi karta. Buyer chat karta hai, chakkar katta hai, aur app par bharosa tootta hai.

**Hal ke 5 hisse:**
- **Deal flow (naya, sabse pehle):** meetup ko "done" tak le jao, dono taraf se confirm ho. Isi se auto-Sold, asli reviews, buyer ki history aur trust score ka data aata hai.
- **Alag rules:** individual ke paas 1 piece, store ke paas stock. Hide logic dono ka alag.
- **Seller Trust Score (0–100):** reply, listing quality, reliability, reviews, activity, verification. Isi se ranking aur badges chalte hain.
- **Smart Auto-Hide:** signals se andaza lagao ki item bik chuka hai, pehle seller se poochho, phir rank girao, aakhir mein hide.
- **Admin panel:** moderation, strikes, disputes, score breakdown aur fraud cluster ek jagah.

**4 sabse bade niyam:**
1. **Pehle poochho, phir rank girao, aakhir mein hide.** Ek signal par kabhi seedha hide nahi.
2. **Har auto-action ulta ho sake.** Seller ek tap mein listing wapas la sake, aur har galat hide gina jaye.
3. **Saare thresholds admin se badlein, app update ke bina.** Launch par data kam hoga, numbers tune karne padenge.
4. **Buyer ko score number mat dikhao, saaf baatein dikhao.** Jaise "Aksar 1 ghante mein reply", "12 deals poori", "ID Verified".

---

## 2. Abhi code mein kya hai (reality check)

Plan banane se pehle ye jaanna zaroori hai ki kya pehle se bana hai, taaki dobara na banaya jaye.

| Cheez | Abhi kya hai | Status | File |
|---|---|---|---|
| Listing status | `active`, `pending`, `sold`, `removed` | Hai | `models/Listing.js` |
| Store stock | `stock` field (default 1) aur variants ka alag stock (size/colour) | Hai | `models/Listing.js`, `utils/listingVariants.js` |
| Sold mark | Seller khud "Mark sold" dabata hai. `soldAt` set hota hai, `soldCount +1`. **Store ka stock nahi ghatta**, poori listing sold ho jaati hai | Aadha | `listingController.updateListing`, `MyListingsScreen` |
| Meetup | Koi bhi ek participant `POST /chats/:id/meetup` se "confirmed" kar deta hai. Doosre ko notification jaata hai. **"Meetup hua / deal done" ka state nahi, buyer kaun tha ye record nahi hota** | Aadha | `chatController.confirmMeetup` |
| Buyer history | `boughtCount` field hai par **kahin badhta nahi** | Nahi | `models/User.js` |
| Reviews | **Sirf shop listing par**, `shopId` zaroori. Admin approve karta hai (`pending` default). Ek listing par ek review. **Meetup/deal ki shart nahi** | Aadha | `controllers/reviewController.js` |
| Individual seller rating | Route `/reviews/user/:userId` hai par individual listing par review ban hi nahi sakta | Nahi | `routes/reviews.js` |
| Listing expiry | Admin setting `listingExpiryDays` (default 0 = band). Query mein purani listing filter hoti hai. **Store aur individual dono par ek jaisa lagta hai** | Aadha | `utils/platformSettings.js`, `listingController.withPlatformWindow` |
| Ranking trust boost | Verified shop 25, **har individual 12 ("Phone Verified")**, unverified shop 0, featured boost alag. Matlab unverified shop individual se neeche | Aadha (galat signal) | `utils/listing.js` |
| Report reasons | `spam`, `fake-listing`, `inappropriate`, `other`. **"Bik chuka / nahi mila", "scam", "no-show" nahi** | Aadha | `models/Report.js` |
| Auto chat restriction | 14 din mein 3 alag logon ne report kiya to chat restrict | Hai | `utils/userRestriction.js` |
| Spam guard | Same title + price 24 ghante mein duplicate block. Naye account (7 din se kam) par 5 listing/din | Hai | `utils/listingSpamGuard.js` |
| Price anomaly | Milti-julti listings (kam se kam 3) se 0.3 guna se kam ya 3 guna se zyada price ho to review | Hai | `utils/priceCheck.js` |
| Photo checks | NSFW, stock/watermark photo detection, AI se galat category | Hai | `utils/imageSafetyCheck.js`, `nsfwImageCheck.js` |
| Duplicate photo (image hash) | Nahi | Nahi | — |
| Banned keywords | Admin list, listing text par hold/block. Category par "pre-approval" option | Hai | `RestrictedKeyword`, `utils/listingModeration.js` |
| Naye seller ki pehli listing approve | Sirf category pre-approval hai, "pehli listing" rule nahi | Nahi | — |
| Shop hours | `openDays`, `openingHours` fields hain | Hai (UI tag "Abhi band" nahi) | `models/Shop.js` |
| Shop verification | Documents private storage mein, PAN/VAT encrypted, admin approve | Hai | `utils/shopVerification.js`, `utils/fieldCrypto.js` |
| Individual ID verification | Nahi | Nahi | — |
| Chat safety | Chat mein safety banner, bahari link par warning. Phone number tab tak chhupa jab tak seller "Show phone" on na kare | Hai | `Mobile/src/utils/chatSafety.js`, `utils/token.js` |
| Chat scam words ("advance bhejo", "eSewa pehle") | Abuse filter sirf gaali-galoch pakadta hai, scam intent nahi | Nahi | `utils/chatAbuseFilter.js` |
| Chat realtime | Har 2 second polling. Socket.io sirf admin live activity ke liye | Aadha | `ChatScreen.js`, `utils/realtime.js` |
| Push notifications | FCM se chat, notification aur moderation result ka push | Hai (`FIREBASE_SERVICE_ACCOUNT_JSON` chahiye) | `utils/callPush.js` |
| Device info | Har session ka device name, platform, IP, Play Integrity level | Hai (fraud cluster ka base) | `models/Session.js` |
| Admin roles, 2FA, audit log | super_admin, admin, moderator, support; 2FA; audit log | Hai | `utils/adminScopes.js`, `utils/audit.js` |
| Account delete 30 din | Self-delete, 30 din grace, phir purge | Hai | `utils/accountDeletion.js` |
| Background jobs | `setInterval` pattern (account purge, health monitor). Cron library nahi | Hai (pattern) | `server.js` |

**Teen sabse zaroori baatein jo isse nikalti hain:**
1. **Deal flow hi missing hai.** Bina "meetup hua" state ke na auto-Sold hoga, na asli review, na reliability score. Isliye ye plan ka Step 1 hai (Section 4).
2. **"Phone Verified" sabke paas hai, isliye uski koi value nahi.** Ranking mein individual ko 12 aur unverified shop ko 0 milta hai, jo ulta hai.
3. **Expiry setting store par bhi lagti hai.** Store rules ke liye ise individual tak seemit karna hoga.

---

## 3. Individual seller vs Store seller

| Baat | Individual seller | Store seller |
|---|---|---|
| Quantity | 1 piece (aksar used item) | Stock count ke saath. Variants ka alag stock (pehle se bana hai) |
| Deal complete hone par | Listing turant **Sold** | Stock 1 ghate (seller confirm kare). 0 par **Out of stock** |
| "Abhi available hai?" reminder | Listing 7 din purani aur 7 din se confirm nahi | Har hafte 1 tap: "Stock sahi hai?" (sabhi listings ek saath, ek push) |
| Auto expiry | Category ke hisaab se 14–45 din (Section 6.4) | **Nahi.** 30 din mein stock confirm zaroori |
| "Item nahi mila" reports | 2 alag buyers (7 din mein) → confirm timer. 3 → hide | 3 alag buyers (7 din mein) → "Stock check" tag + 48 ghante. Seedha hide nahi |
| Chat mein "bik gaya" | Seller ko prompt: "Sold mark karein?" | Seller ko prompt: "Stock update karein?" |
| Seller inactive | 7 din app nahi khola aur buyers chat kar rahe → listings hide | 14 din → poora store hide. **Chhutti mode** se bach sakte hain |
| Chhutti mode | **Haan** (Dashain/Tihar mein individual bhi bahar jaate hain), max 30 din | Haan, max 30 din. Listings "Chhutti par" tag ke saath dikhein |
| Penalty kis par | Ghost listing, no-reply, no-show | Galat stock, confirm miss, no-reply |
| Hide kiska | Ek listing | Ek listing ya poora store |

> **Note:** "Shop" ka matlab hai `sellerType: 'shop'` wali listing. Jo user "both" hai, uski har listing apne type ke rules follow karegi.

---

## 4. Deal flow: chat → meetup → deal complete (sabki neev)

Original plan mein "meetup dono taraf se complete → auto Sold" likha tha, par abhi code mein meetup sirf ek taraf se "confirmed" hota hai aur "hua ya nahi" ka koi state nahi. Isliye ye flow sabse pehle banana hai.

### 4.1 States (Chat par)

| State | Kab | Kaun |
|---|---|---|
| `none` | Chat shuru | — |
| `proposed` | Kisi ne jagah aur samay suggest kiya | Koi bhi |
| `scheduled` | Doosre ne accept kiya | Doosra participant |
| `completed` | **Dono** ne "Deal ho gayi" dabaya, ya handshake code match hua | Dono |
| `cancelled` | Kisi ne cancel kiya (reason ke saath) | Koi bhi |
| `no_show` | Ek ne bola "wo nahi aaye", doosre ne 48 ghante mein jawab nahi diya | Ek |

**Buyer kaun hai:** chat ka wo participant jo listing ka seller nahi hai. Ise `chat.buyer` mein save karo.

### 4.2 Handshake (fake deal se bachne ke liye)
- Meetup ke din seller ki screen par 4 digit code dikhe. Buyer apni screen par wo code daale to deal `completed`.
- Ya dono "Deal ho gayi" dabayein. Ek ne dabaya aur doosre ne 72 ghante tak nahi dabaya to deal "completed (ek taraf)" maani jaye. Score mein iska weight aadha.
- Storefront QR infra pehle se hai, baad mein code ki jagah QR bhi ho sakta hai.

### 4.3 Deal complete hone par kya ho
- **Individual:** listing turant `sold`, `soldAt` set, seller ka `soldCount +1`, buyer ka `boughtCount +1`.
- **Store:** seller ko prompt: "1 piece bika, stock 5 se 4 karein?" Ek tap. 24 ghante mein jawab nahi diya to apne aap -1.
- **Review unlock:** sirf isi chat ke buyer ko, isi listing ke liye, 30 din tak. Individual aur shop dono ke liye.
- **"Meri Purchases"** screen asli data se bane (abhi andaze se banti hai).

### 4.4 Gaming se bachao
- Same device ya same IP se bane do accounts ke beech deal ko score mein nahi gina jaye (Session data pehle se hai).
- Ek buyer–seller jodi ki 30 din mein 2 se zyada deals ko score mein 1 hi gino.
- Chat 10 minute se kam purani ho to deal complete nahi ho sakti.

---

## 5. Store ke liye quantity-based logic

Store ka item bikne par band nahi hota, sirf stock ghatta hai.

### 5.1 Store listing ke 3 type (`listingKind`)

| Type | Kab | Hide ka tareeka |
|---|---|---|
| `stock` | Kapde, cover, grocery: kai piece | Quantity se (neeche table) |
| `single` | Store ke paas ek hi used ya display piece | Individual jaisa: deal hote hi Sold |
| `always` | Service, menu, made-to-order | Quantity nahi. 30 din mein ek baar confirm |

Default: shop listing `stock`, individual `single`. Seller post karte waqt badal sake.

### 5.2 Stock status (buyer ko dikhta hai)

| Status | Kab | Buyer ko kya dikhe |
|---|---|---|
| In stock | Quantity low limit se upar | Normal |
| Low stock | Quantity `lowStockLimit` (default 3) ya kam | "Sirf 2 bache" |
| Out of stock | Quantity 0 | Dhundhla card, search mein neeche. Chat button ki jagah **"Wapas aane par batao"** |
| Unconfirmed | 14 din se stock confirm nahi | Chhota badge, rank kam |
| Under check | 7 din mein 3 alag buyers ne "nahi mila" bola | "Stock check ho raha hai" tag |
| Hidden | Neeche ke rules poore hue | Sirf seller aur admin ko |

> Variants wali listing par status har variant ka alag ho. Listing tabhi Out of stock jab saare variants 0 hon.

### 5.3 Trigger → action

| Trigger | Action |
|---|---|
| Deal complete | Stock -1 (seller ek tap se confirm, 24 ghante baad apne aap) |
| Stock 0 | Out of stock, rank neeche. 7 din 0 raha to hide. Restock (+) par turant wapas |
| Hafte ka reminder | Ek push: "Aapke 12 items ka stock sahi hai?" Do button: **Sab sahi hai** / **Update karo** |
| 14 din confirm nahi | Unconfirmed badge, rank kam, stock accuracy score ghate |
| 30 din confirm nahi | Listing hide, seller ko notify. Confirm karte hi wapas |
| 7 din mein 3 alag buyers ka "nahi mila" | Under check. Seller 48 ghante mein confirm kare, warna hide |
| Chat mein ek baar "nahi hai" | Sirf seller ko prompt. Auto-hide nahi |
| Price ya quantity badli | Stock "fresh confirmed" gina jaye |
| Store band (`openingHours` ke baahar) ya "Abhi band" toggle | Listings dikhein, "Abhi band" tag ke saath. Hide nahi |
| 14 din store inactive (chhutti mode nahi) | Poora store hide, seller ko warning aur "Wapas laao" button |

### 5.4 Zaroori baatein
- **Ek-tap stock update:** My Listings mein + aur − button, poora form khole bina. Ye sabse zaroori UX hai.
- **Overselling:** stock 0 hote hi buyer ko "Out of stock" dikhe aur naye chat se pehle warning.
- **Reserve per unit (badla gaya):** original plan mein "24 ghante ka unit hold" tha. KinBech mein order/checkout nahi hai, isliye ise **chhod diya**. Iski jagah meetup `scheduled` hone par stock count mein "1 meetup pending" dikhe, bas.
- **Bulk update (baad mein):** CSV se stock. Checkout jaisa kuch na dikhe.

**Store ko individual wale rules kyun nahi?** Store ke paas 10 piece hon aur 1 bike, to listing hide karna seller aur buyer dono ka nuksan hai. Isliye store par pehle stock check, phir rank, aakhir mein hide.

---

## 6. Individual seller ka Auto-Hide

Har individual listing ka ek **Sold-Likelihood Score (0–100)** banta hai: item bik chuka hone ki sambhavna. Shuru mein ye **rule-based aur samjhaya ja sakne wala** ho, ML nahi.

### 6.1 Signals aur points (shuruaati numbers, admin se badlein)

| Signal | Points |
|---|---|
| Pichhle 7 din mein 3+ alag buyers ne chat kiya aur seller ne kisi ko reply nahi kiya | +25 |
| Seller ki chat mein "bik gaya / sold / bikyo / sakiyo / chaina" jaisa shabd | +30 |
| 2 alag buyers ka "Bik chuka / nahi mila" report | +35 (har extra report +15) |
| Seller 5+ din se app nahi khola | +15 |
| Listing category ke expiry din ke 70% se purani aur kabhi confirm nahi | +15 |
| Meetup `scheduled` ho chuka (kisi aur buyer ke saath) | +10 |
| Seller ne pichhle 3 din mein "Haan, available hai" confirm kiya | −40 |
| Seller roz active aur 24 ghante mein reply de raha | −20 |
| Price ya photo pichhle 3 din mein badli | −15 |

Score 0 se 100 ke beech clamp ho. Har listing par admin dekh sake ki score kis wajah se bana.

### 6.2 Action ladder

| Score | Kya hoga |
|---|---|
| 40+ | Seller ko push: "8 log ne is item ke baare mein poocha. Kya abhi available hai?" Do button: **Haan** / **Bik gaya** |
| 60+ | Search mein neeche, aur 24 ghante ka confirm timer |
| 80+ aur 48 ghante koi jawab nahi | Auto-hide, seller ko "Confirm pending" dikhe. Ek tap se wapas |
| Deal `completed` | Turant Sold |
| Seller 7 din inactive aur buyers chat kar rahe | Listings hide (seller ke wapas aate hi ek tap mein restore) |

**Sirf time se kabhi hide nahi (25 Oct 2026):** jis listing par buyers ka asar nahi (koi chat reply ke intezaar mein nahi, koi "not available" report nahi), wo kitni bhi purani ho, hide nahi hoti. Use bas category ke expiry cycle mein ek baar "Still available?" reminder milta hai. Store ka out-of-stock item bhi hide nahi hota; "Out of stock" tag ke saath neeche rank hota hai. Store ka unconfirmed stock aur inactive store tabhi hide hote hain jab buyers wait kar rahe hon.

### 6.3 Chat se "sold" pakadna
- **Keyword list (server par, free, fast), sirf English phrases:** jaise "already sold", "it's sold", "sold out", "no longer available", "out of stock", aur poora message sirf "Sold". Akela "sold" lambe sentence mein match nahi hota ("I sold my old phone" galat signal na de). Extra phrases env `CHAT_SOLD_WORDS` se.
- **Gemini sirf baad mein, optional:** sirf un messages par jo keyword se match hue aur intent saaf nahi. Poora chat kabhi na bhejo, kuch store mat karo. Lagat aur privacy dono kam rahenge.
- Privacy Policy mein likho: "Safety aur listing ki jaankari sahi rakhne ke liye messages automatically check hote hain."

### 6.4 Category ke hisaab se timer

| Category ka type | Expiry | "Available hai?" reminder |
|---|---|---|
| Fast (phone, electronics, accessories) | 14 din | 5 din |
| Normal (fashion, furniture, home) | 30 din | 7 din |
| Slow (bike, car, ghar/kamra, zameen) | 45 din | 10 din |

Category model mein `expiryDays` aur `reminderDays` daalo. Global `listingExpiryDays` sirf fallback rahe, aur **sirf individual listings** par lage.

### 6.5 Fair rakhne ke niyam
- **Galat hide ka hisaab:** seller ne auto-hide ulta kiya to counter badhe aur us seller ka threshold 10 point dheela ho.
- **Penalty sirf asli ghosting par:** 30 din mein 2 se zyada auto-hide jinhe seller ne "bik gaya" confirm kiya par khud mark nahi kiya tha.
- **Sold ka reward:** jo deal complete ya khud Sold mark kare, uski Reliability badhe aur "Honest Seller" badge ki taraf gine.

---

## 7. Seller Trust Score aur ranking

Har seller (individual aur store) ka score 0–100. Weights dono ke alag hain.

### 7.1 Hisse aur data kahan se aayega

| Hissa | Individual | Store | Kya naapte hain | Data source |
|---|---|---|---|---|
| Responsiveness | 25% | 20% | Pehle message ka reply %, median reply time (raat 10 se subah 7 NST ginti mein nahi; store ke liye `openingHours`) | `Message` timestamps (pehle se save hote hain) |
| Listing quality | 20% | 15% | Pehli baar approve %, reject/hold %, photo count, zaroori fields | `Listing.status`, `moderationReason` |
| Stock accuracy | — | 20% | Time par stock confirm, "nahi mila" reports kam | Naye fields (Section 10) |
| Reliability | 20% | 10% | Deal complete %, no-show, Sold mark ki aadat, stale listing % | Deal flow (Section 4) |
| Buyer feedback | 15% | 15% | Sirf deal complete ke baad wale reviews, Bayesian average | `Review` (deal-gated) |
| Activity | 10% | 5% | Pichhle 30 din mein kitne din active | Naya `activeDays` counter |
| Verification | 10% | 15% | ID verified, Shop verified, address/shop photo. **Phone sabke paas hai, isliye 0 point** | `Shop.isVerified`, naya user ID verification |

### 7.2 Penalty
- Confirmed scam report (admin ne maana): score max 20, account review mein.
- Fake ya duplicate photo, banned item ki koshish, strikes, baar-baar ghost listing.
- Chat mein advance paisa maangna (scam detector ne pakda aur admin ne confirm kiya).

### 7.3 Fair rakhne ke niyam
- **Time decay:** pichhle 30 din ka data poora, 30–90 din aadha, 90 din se purana nahi gina jaye.
- **Kam data par smoothing (Bayesian):** jab tak 5 deals ya 10 chats na hon, score 50 ki taraf khincha rahe.
- **Naya seller:** 50 se shuru. Pehle 14 din "New seller" label (honest disclosure) aur discovery slot mein jagah.
- **Gaming rokna:** apne doosre account se chat, same device ke accounts, 5 second ke andar ke khali reply ginti mein nahi.
- **Score har raat banega**, live nahi. Isse load kam aur gaming mushkil.

### 7.4 Tiers

| Score | Tier | Asar |
|---|---|---|
| 85+ | Top Seller | Home par highlight, ranking boost |
| 70–84 | Trusted | Thoda boost |
| 50–69 | Standard | Normal |
| 30–49 | Watch | Listing limit (3/din), naye listing par extra check |
| 30 se kam | Restricted | Har nayi listing `pending` (admin approve) |

Tier tabhi bade ya ghate jab 3 raat lagaatar wahi range rahe. Ek raat ke uchhal se tier na badle.

### 7.5 Ranking mein istemal
```
rank = relevance × freshness × sellerFactor × listingQuality × distance
sellerFactor = 0.8 + (score / 100) × 0.7     →  0.8 se 1.5 ke beech
```
- Ye mojooda `listingTrustBoost` (shop 25 / individual 12) ki jagah lega.
- Har 10 results mein 1 jagah naye ya kam data wale sellers ke liye.
- Featured listing ka boost alag rahe, par Restricted seller featured na ho sake.
- Home par "Top Sellers" aur "Fast Replies" ki row.
- Profile par score number nahi, 3 saaf lines: "Aksar 1 ghante mein reply", "92% meetup poore", "ID Verified".

### 7.6 Rollout (data kam ho tab kya karein)
1. **Pehle signals dikhao** (reply time, last active, deals) — launch ke saath.
2. **Score background mein banao,** admin ko dikhao, ranking mein mat lagao — 4–6 hafte.
3. **Admin ne numbers theek lage to ranking mein on karo** (setting se).

---

## 8. Item aur seller ko trustable banana

### 8.1 Seller trust

| Kaam | Status | Note |
|---|---|---|
| Verification levels: Phone → ID (citizenship) → Shop | Aadha | Shop verification hai. Individual ID flow banana hai, shop wale private documents aur encryption infra ko reuse karke. Citizenship number encrypt ho |
| Badges: ID Verified, Fast Responder, Trusted Seller (10+ deals, 4+ rating), Honest Seller | Nahi | "Phone Verified" badge hatao ya chhota karo (sabke paas hai) |
| Naye seller par limit | Aadha | 7 din tak 5/din hai. **Pehli listing admin approve** jodna hai |
| Review sirf deal complete par, ek deal ek review | Nahi | Section 4.3 |
| Two-sided review (seller bhi buyer ko rate kare) | Nahi | No-show buyers bhi filter honge |

### 8.2 Item trust

| Kaam | Status | Note |
|---|---|---|
| Kam se kam photo | Nahi | Individual: 2 photo, store: 1. Camera se li photo par "Live photo" tag |
| Duplicate photo check (image hash) | Nahi | `sharp` se perceptual hash, doosre account ki listing se match ho to hold |
| AI check: stock photo, galat category, risky item | Hai | `imageSafetyCheck.js` |
| Price anomaly | Hai | `priceCheck.js` |
| Zaroori fields: condition, age, bill/box | Aadha | `condition` hai. "Kitna purana" aur "Bill/box hai?" jodna hai |
| Banned items aur keywords | Hai | Admin `RestrictedKeywords` page |

### 8.3 Meetup safety

| Kaam | Status | Note |
|---|---|---|
| Handshake code | Nahi | Section 4.2 |
| Safe place suggestion | Aadha | Abhi sirf option list hai. Har city ke safe points (police post, mall, chowk) admin se |
| Pehli chat par safety note | Hai | Chat banner. Pehli meetup par ek baar popup aur jodo |
| Chat scam detection ("advance bhejo", "eSewa pehle", "WhatsApp par aao") | Nahi | Keyword list se warning **dono ko**. Message block nahi, sirf warning aur admin flag |
| Phone aur link masking | Aadha | Phone default chhupa hai, link par warning hai. Chat text mein likha number mask karna baaki |
| No-show tracking | Nahi | Deal flow ka `no_show` |
| "Bik chuka / nahi mila", "Scam", "No-show" report buttons | Nahi | `Report.reason` enum mein jodna hai |

### 8.4 Fraud rokna

| Kaam | Status | Note |
|---|---|---|
| Ek device se kai account | Aadha | `Session` mein device aur IP hai. Admin view banana hai |
| Ek photo kai account par | Nahi | Image hash ke saath |
| Fraud cluster: same device, photo ya number | Nahi | Admin page par grouped list |
| Play Integrity level | Aadha | Backend tayyar, mobile native package baad mein |

---

## 9. Admin panel

| Hissa | Abhi | Banana hai |
|---|---|---|
| **Dashboard** | Naye users, DAU, listings, live activity, alerts | Sold rate, time-to-sell, stale listing %, chat → meetup → deal funnel, auto-hide count, OTP/SMS kharcha, Gemini usage |
| **Moderation queue** | Listings (pending), Reports, Reviews alag pages | Ek queue: naye seller ki pehli listing, reported listing/user, AI-flagged, "nahi mila" clusters. Har case par 24 ghante ka timer. Approve, reject (reason), hide, edit request |
| **User management** | Users list, suspend, chat restriction | Strike system (warning → 7 din suspend → ban), device/IP links, shadow-ban, deletion requests ka 30 din timer |
| **Seller leaderboard** | Nahi | Top, Watch, Restricted. Individual aur Store filter |
| **Score breakdown** | Nahi | "Reply rate 40%, 2 scam reports, 3 auto-hides" jaisi wajah. Manual override audit log ke saath |
| **Store stock view** | Nahi | Out of stock, Unconfirmed, Under check listings. Kaun sa store ka stock accuracy kharab |
| **Auto-hide report** | Nahi | Kitni hide hui, kitni seller ne wapas ki (restore rate). Restore rate 15% se upar ho to threshold dheela karo |
| **Dispute aur support** | Support tickets aur Reports alag | Har scam case ek ticket: evidence (chat snippet, photo), faisla, close date |
| **Platform control** | Categories, banned keywords, broadcast, settings (expiry, min price), AI models | Saare trust thresholds aur weights (Section 10.4), category expiry, force-update, maintenance mode |
| **Safety aur compliance** | Roles, 2FA, audit log, error log, security alerts | Backup status, Sentry link |
| **Growth insights** | Nahi | Jo search hota hai par milta nahi, city × category supply-demand |

---

## 10. Data model, jobs aur config

### 10.1 Naye fields

**Listing**
- `listingKind`: `single` | `stock` | `always`
- `lowStockLimit` (default 3), `stockConfirmedAt`
- `availabilityConfirmedAt` (individual "Haan, available hai")
- `soldLikelihood` (0–100) aur `soldLikelihoodReasons`
- `autoHidden`: `{ at, reason, restoredAt }` — **status ko overload mat karo.** Abhi account delete bhi `removed`/`inactive` status use karta hai; dono mix hue to restore galat ho jayega.
- `notFoundReports` count (7 din window)

**Chat**
- `buyer`, `deal`: `{ state, proposedAt, scheduledAt, completedAt, completedBy: [], code, cancelReason }`

**User**
- `activeDays` (pichhle 30 din ke din), `vacationUntil`
- `idVerification`: `{ status, documents, numberEncrypted, reviewedBy, reviewedAt }`
- `strikes`: `[{ level, reason, at, by, expiresAt }]`

**Shop**
- `vacationUntil`, `closedNow` toggle, `lastStockReminderAt`

**Report.reason** mein jodo: `not-available`, `scam`, `no-show`

**Review**: `shopId` optional, `seller` (User) required, `chat` (deal) required, `direction`: `buyer_to_seller` | `seller_to_buyer`

**Category**: `expiryDays`, `reminderDays`

### 10.2 Naye collections
- `seller_scores`: `{ seller, date, score, tier, parts: {...}, reasons: [] }` — har raat ek row. Isse graph aur history milegi.
- `trust_events`: sirf wo events jo kahin aur se nahi nikalte: `listing_confirmed_available`, `stock_confirmed`, `stock_updated`, `listing_auto_hidden`, `listing_restored`, `deal_state_changed`. TTL 180 din.

> **Note:** original plan mein `message_received`, `message_replied`, `listing_created`, `report_filed` jaise events alag se log karne ko kaha tha. Inki zaroorat nahi, kyunki ye data `Message`, `Listing` aur `Report` collections mein pehle se timestamps ke saath hai. Duplicate logging se bas storage aur bugs badhenge.

### 10.3 Jobs (mojooda `setInterval` pattern par)

| Job | Kab | Kya |
|---|---|---|
| Sold-likelihood | Har 1 ghanta | Active individual listings ka score, ladder actions |
| Stock reminder | Roz subah 10 baje NST | Jinka hafta poora hua unhe ek push |
| Stale / expiry | Roz | Unconfirmed, hide, store inactive |
| Seller score | Roz raat 2 baje NST | `seller_scores` mein row, tier update |
| Deal no-show / auto-complete | Har 1 ghanta | 48 aur 72 ghante wale timers |

**Zaroori:** server ek se zyada instance par chale to job do baar na chale. Iske liye Mongo mein ek chhota `job_locks` document (lease) rakho. Saare samay Nepal time (UTC+5:45) mein.

### 10.4 Config (admin se badle, app update ke bina)
`PlatformSettings` mein ek `trust` section:
- Sold-likelihood ke points aur ladder thresholds (40 / 60 / 80)
- Reminder aur expiry din (category override ke saath)
- "Nahi mila" report counts (individual 2/3, store 3)
- Trust score weights aur tier boundaries
- Ranking mein score on/off, `sellerFactor` ki range
- Feature flags: auto-hide on/off, store rules on/off, deal handshake on/off

---

## 11. Notification ke niyam

Bahut saare reminders seller ko pareshan karenge aur wo notification band kar dega. Isliye:
- **Ek seller ko trust/stock wale push din mein max 1.** Kai listings ho to ek hi push mein jodo ("3 items par buyers poochh rahe hain").
- **Raat 9 se subah 8 baje NST tak** trust push nahi.
- Har push mein seedha action button ho (**Haan available hai** / **Bik gaya** / **Stock update**), app khol kar dhundhna na pade.
- Push band ho to wahi baat app ke andar Notifications mein dikhe.

---

## 12. Banane ka order (sabse zyada asar pehle)

| Step | Kaam | Kisliye | Depends on | Status (25 Oct 2026) |
|---|---|---|---|---|
| 0 | Launch P0 items (Section 14) | Bina iske public mat jao | — | **Hai** (SMS: Sparrow/Aakash env se) |
| 1 | **Deal flow:** buyer record, states, handshake, auto-Sold, `boughtCount` | Baaki sab ka data isi se | — | **Hai**, auto-detect (meetup + chat words + seller "sold"). Handshake code baad mein |
| 2 | Report reasons + "nahi mila" button, review deal-gated (individual + shop) | Asli feedback | 1 | **Hai** |
| 3 | Individual: "available hai?" reminder, category expiry, auto-hide ladder (pehle sirf rank down + push, hide off) | Stale listings turant kam | 1, 2 | **Hai** (hide step bhi on, ek tap "Still available" se wapas) |
| 4 | Store: `listingKind`, ek-tap stock, hafte ka reminder, Out of stock, "Abhi band" tag | Store ke liye sahi logic | 1 | **Hai** |
| 5 | Profile/listing par signals: reply time, last active, deals. "Phone Verified" hatao | Buyer ko turant faayda | 1 | **Hai** (score number kabhi public nahi) |
| 6 | Trust score background mein + admin score breakdown | Numbers tune karna | 1–5 | **Hai** (raat 1–5 baje NST) |
| 7 | Admin: ek moderation queue, strikes, store stock view, auto-hide report | Control | 3, 4, 6 | **Hai** (Admin → Seller Trust) |
| 8 | Score ranking mein on, tiers, badges, individual ID verification | Achhe sellers upar | 6 | **Aadha**: tiers + badges hain; ranking admin toggle se (default off); ID verification baad mein |
| 9 | Chat scam warning, image hash, fraud cluster, auto-hide (hide step) on | Fraud aur safai | 3, 6 | **Hai** |
| 10 | Gemini chat intent, realtime chat, bulk stock CSV | Baad mein | — | **Nahi** (keyword intent hi chal raha hai) |

**Note:** Listing ka naya status `hidden` hai (auto-hide / suspension). Ye `removed` se alag hai: seller "Still available" ya stock update se khud wapas la sakta hai. `pending` aur `sold` pehle jaise hain.

---

## 13. Success metrics aur guardrails

| Metric | Matlab | Target (3 mahine) |
|---|---|---|
| Stale chat rate | Buyer ne chat kiya aur jawab mila "bik gaya" ya reply hi nahi aaya | 40% se kam |
| Confirmed listings | Active listings jo pichhle 14 din mein confirm hui | 70% se zyada |
| Auto-hide restore rate | Auto-hide jinhe seller ne wapas kiya | 15% se kam (zyada ho to threshold dheela) |
| Median first reply time | Seller ka pehla reply | 2 ghante se kam |
| Deal completion | Scheduled meetups jo `completed` hue | 50% se zyada |
| Reviews per deal | Completed deals par review | 30% se zyada |
| Scam reports per 1000 chats | — | Har mahine ghate |

**Guardrails (agar ye bigde to feature rok do):**
- Active listings ki ginti 20% se zyada gir jaye.
- Sellers ka notification opt-out badh jaye.
- Restore rate 25% se upar chala jaye.

---

## 14. Launch Checklist (P0 se P4), status ke saath

### P0 Blocker — inke bina public mat jao

| # | Kaam | Status | Note |
|---|---|---|---|
| 1 | **Asli SMS OTP** (Sparrow ya Aakash) | **Nahi** | Code mein koi SMS provider integration nahi hai. Ye **code ka kaam** hai, sirf env nahi |
| 1a | `DEFAULT_OTP=random`, `NODE_ENV=production` | Aadha | **Khatra:** env na ho to code `1111` maan leta hai. Production mein code khud random kare, `1111` sirf development mein |
| 2 | Leaked keys rotate (Gemini, R2) | Ops | — |
| 3 | OTP aur login par rate limit | Hai | Phase 1 + captcha on risk |
| 4 | Admin default password na chhodo | Hai | Pehle login par password badalna zaroori, 2FA option |
| 5 | CORS se `origin: *` hatao | Hai | Phase 1 |
| 6 | Test accounts aur 1111 wale users hatao | Ops | Launch se pehle DB clean |

### P1 Release se pehle

| # | Kaam | Status | Note |
|---|---|---|---|
| 7 | FCM: `FIREBASE_SERVICE_ACCOUNT_JSON` + naya Android build | Code hai | Env aur build baaki |
| 8 | Login token: chhoti expiry aur revoke | Hai | 15 min access + refresh rotation, device sessions |
| 9 | MongoDB backup on (encrypted) | Ops | — |
| 10 | `SENTRY_DSN` set karo | Code hai | Env baaki |
| 11 | Compression code live: git pull, npm install | Ops | — |
| 12 | Release keystore ka alag backup | Ops | — |
| 13 | Mac disk khali karke release AAB (R8 on hai, test karo) | Ops | Disk abhi ~2% free |

### P2 Play Store ki shartein

| # | Kaam | Status | Note |
|---|---|---|---|
| 14 | Account delete: in-app, 30 din | Hai | Website par policy page bhi hai |
| 15 | Privacy Policy aur Terms ka public link | Hai | Website legal pages |
| 16 | Data safety form: phone, photo, location, camera, mic | Ops | Chat auto-check ka bhi zikr karo |
| 17 | Release app se poora flow test | Ops | — |

### P3 Trust aur launch quality

| # | Kaam | Status | Note |
|---|---|---|---|
| 18 | Support WhatsApp ya phone number | Nahi | Footer mein "coming soon" likha hai |
| 19 | Safety note pehli chat/meetup par | Aadha | Chat banner hai, meetup popup baaki |
| 20 | Naye seller ki pehli listing admin approve | Nahi | Section 8.1 |
| 21 | Review sirf deal complete ke baad | Nahi | Section 4 |
| 22 | Launch se pehle 100–200 asli listings | Ops | Seed script nahi hai |
| 22a | **Deal flow ka basic version** (buyer record + "Deal ho gayi") | Nahi | Isi se reviews aur score ka data shuru hoga |

### P4 Baad mein theek hai

| # | Kaam | Status |
|---|---|---|
| 23 | Chat realtime (abhi 2 second polling) | Aadha |
| 24 | Listing pagination | Hai (listings mein page/limit) |
| 25 | Shop stock tracking, bulk upload (checkout jaisa nahi) | Aadha (stock + variants hai) |
| 26 | Poori app ka translation | Nahi |

**Hataya gaya:** payment gateway (eSewa/Khalti). Paisa meetup par users ke beech hota hai. eSewa/Khalti sirf saved payment methods hain.

**Order:** pehle P0 (SMS integration sabse lamba kaam hai), phir P1. P2 ka paperwork saath chalao kyunki Play Store review mein time lagta hai.

---

## 15. Privacy aur legal
- Chat auto-check (keywords, baad mein Gemini) ka Privacy Policy aur Play Data Safety form mein zikr.
- Gemini ko sirf match hua chhota snippet jaye, user ka naam ya number nahi. Response store na ho.
- Citizenship/ID documents private storage mein, number encrypted, admin dekhe to audit log (shop PAN/VAT jaisa).
- Trust score aur auto-hide "automated decision" hain. Seller ko wajah dikhe ("3 buyers ne nahi mila bola") aur appeal ka rasta ho.
- `trust_events` aur `seller_scores` ka retention (180 din / 1 saal) Privacy Policy ke retention section mein likho.

---

## 16. Faisle jo aapko lene hain
1. **Handshake:** 4 digit code (simple) ya sirf dono ka "Deal ho gayi" button (aur bhi simple, par fake karna aasaan)?
2. **Two-sided review:** seller bhi buyer ko rate kare, launch par ya baad mein?
3. **Individual ID verification:** citizenship photo lena hai ya abhi sirf Shop verification kaafi hai?
4. **Auto-hide launch par:** sirf "rank down + push" (safe), ya hide bhi on?
5. **Gemini chat intent:** bilkul nahi, ya keyword ke baad optional?
6. **SMS provider:** Sparrow SMS ya Aakash SMS — account aur sender ID kis naam se?

---

*Jab bhi koi item ban jaye, uska status yahan update karo.*
