export const LEGAL_LAST_UPDATED = '29 October 2026';

export const LEGAL_COMPANY = {
  name: 'KinBech Pvt. Ltd.',
  address: 'Nepal',
  supportPhone: '+977 9815759505',
  supportEmail: 'support@kinbech.com',
  privacyEmail: 'support@kinbech.com',
  legalEmail: 'support@kinbech.com',
  website: 'https://kinbech.codersalpha.com',
  appPackage: 'com.codersalpha.kinbech',
  minAge: 16,
};

/** Play Store / Data safety aligned permission disclosures */
export const APP_PERMISSIONS = [
  {
    id: 'account',
    name: 'Google account (name, email, profile photo)',
    android: 'Not a device permission — shared by Google when you sign in',
    required: true,
    when: 'Sign in with Google',
    why: 'To create your account, sign you in securely, and show your name and photo to people you deal with.',
    data: 'Your Google account ID, email, name, and profile photo are stored on our servers while your account is active. We never see your Google password.',
    optional: false,
  },
  {
    id: 'phone',
    name: 'Phone number (optional)',
    android: 'Not a device permission — typed by you',
    required: false,
    when: 'If you add a phone number to your profile',
    why: 'Lets buyers call you directly, only if you turn on "Show phone number" in Privacy settings.',
    data: 'Stored on your profile. Hidden from other users unless you choose to show it.',
    optional: true,
  },
  {
    id: 'location',
    name: 'Location (When In Use)',
    android: 'ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION',
    required: false,
    when: 'Home, Explore, posting a listing, profile setup, shop creation',
    why: 'Show listings near you, sort by distance, and auto-fill city/district on your profile, listing, or shop.',
    data: 'Coordinates are sent to our servers to find nearby listings, and saved only when you save a location on your profile, listing, or shop. Location is never collected in the background.',
    optional: true,
  },
  {
    id: 'photos',
    name: 'Photos & media library',
    android: 'Android photo picker (no gallery permission on Android 13+); READ_EXTERNAL_STORAGE on Android 12 and below',
    required: false,
    when: 'Profile photo, listing photos, shop logo and cover, shop verification documents',
    why: 'Let you upload images for your profile, product listings, and shop.',
    data: 'Only the images you pick are uploaded. We do not scan your gallery. Uploaded listing photos are checked automatically for prohibited content and copied photos (see the Privacy Policy).',
    optional: true,
  },
  {
    id: 'camera',
    name: 'Camera',
    android: 'CAMERA',
    required: false,
    when: 'When you take a listing or profile photo, or record a short listing video (max 30 seconds)',
    why: 'Let you photograph items and record one short product video inside the app.',
    data: 'Only the photos and video you capture and choose to post are uploaded.',
    optional: true,
  },
  {
    id: 'microphone',
    name: 'Microphone',
    android: 'RECORD_AUDIO, MODIFY_AUDIO_SETTINGS',
    required: false,
    when: 'Voice calls, voice messages in chat, voice search, and listing video sound',
    why: 'Let you talk to buyers and sellers, send voice notes, and search by speaking.',
    data: 'Call audio is streamed live through our calling provider (Agora) and is never recorded. Voice messages are uploaded and kept with the chat. Voice search is turned into text by your device speech service (Google); only the text reaches KinBech.',
    optional: true,
  },
  {
    id: 'calls',
    name: 'Incoming calls & background calling',
    android: 'MANAGE_OWN_CALLS, BIND_TELECOM_CONNECTION_SERVICE, FOREGROUND_SERVICE, FOREGROUND_SERVICE_PHONE_CALL, FOREGROUND_SERVICE_MICROPHONE, USE_FULL_SCREEN_INTENT, WAKE_LOCK, VIBRATE, SYSTEM_ALERT_WINDOW, DISABLE_KEYGUARD, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    required: false,
    when: 'When someone calls you on KinBech, and while a call is active',
    why: 'Ring and show the incoming call screen even when the phone is locked or the app is closed, and keep the call connected when you switch apps. Battery optimisation is turned off only if you approve it.',
    data: 'No extra data is collected. These permissions only control how calls ring and stay connected. We keep a call record (who called whom, when, and how long) and add up daily talk time for call limits.',
    optional: true,
  },
  {
    id: 'notifications',
    name: 'Notifications',
    android: 'POST_NOTIFICATIONS (Android 13+)',
    required: false,
    when: 'If you enable notifications in Settings',
    why: 'Send incoming calls, chat replies, listing activity, safety alerts, and (if on) a few daily updates about your listings and new items near you.',
    data: 'A device push token is stored and used through Firebase Cloud Messaging (Google) to deliver notifications. Turn off daily updates or all notifications anytime in Settings.',
    optional: true,
  },
  {
    id: 'internet',
    name: 'Network access',
    android: 'INTERNET',
    required: true,
    when: 'Always while using the app',
    why: 'Load listings, chat, and account data from KinBech servers, and keep your account safe.',
    data: 'Every request carries your IP address, device name and platform, app version, and a random install ID created by the app. While the app is open it also reports which screen you are on (see "Live activity" in the Privacy Policy).',
    optional: false,
  },
];

export const PERMISSIONS_NOT_USED = [
  'Call recording — calls are never recorded',
  'Background location — not collected',
  'Contacts / address book — not accessed',
  'SMS and call logs — not accessed',
  'Advertising ID — not used; KinBech shows no third-party ads',
  'Calendar, Bluetooth, body sensors — not used',
];

export const LEGAL_DOCUMENTS = {
  privacy: {
    title: 'Privacy Policy',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Data requests',
      body: `To export, correct, or delete your personal data, use Settings → Privacy & Security in the app, or email ${LEGAL_COMPANY.privacyEmail} from the email address of the Google account you sign in with. We respond within 30 days.`,
    },
    sections: [
      {
        title: '1. Introduction',
        body: `KinBech ("we", "us", "our") operates the KinBech mobile application and website (${LEGAL_COMPANY.website}), a local marketplace where people in Nepal buy and sell nearby and meet in person. This Privacy Policy explains what personal data we collect, why we collect it, how we use and share it, how long we keep it, and your rights. By using KinBech you agree to this policy. Minimum age: ${LEGAL_COMPANY.minAge} years.`,
      },
      {
        title: '2. Information you give us',
        body: 'Account: from Google sign-in — your Google account ID, email, name, and profile photo; plus an optional phone number, bio, city/district, seller type (individual, shop, or both), and preferences (language, theme, notification toggles, daily updates, visibility settings). Shops: shop name, logo, cover photo, address, opening hours, products, payment methods the shop accepts, and — if you request a verified badge — PAN/VAT number and business documents. Listings: titles, descriptions, prices, categories, photos, an optional short video, variants and stock, meetup preferences, and listing location. Communication: chat messages, voice messages, meetup details, call records (who called, when, and how long — never the call audio), reviews, reports, blocks, and support tickets. Payments: payment methods you save so buyers can pay you (eSewa, Khalti, IME Pay, bank, cash), and records of posting plans you buy (see section 10). Invites: who invited you with a referral code, if anyone.',
      },
      {
        title: '3. Information collected automatically',
        body: 'Device and network: IP address, device name and model, platform, OS and app version, a random install ID the app creates on first launch (it is not a hardware ID and resets when you reinstall), and your push token. Signed-in devices: for each device you sign in on, its name, IP address, and when it was last used. Live activity: which screen you have open while the app is in use (section 6). Activity: listings you view, save, or chat about, categories you open, and searches you make — used for recommendations (section 8). Talk time: daily totals of answered call minutes, for call limits. Error reports: when the app crashes or a request fails, the error, screen, device, and app version. We do not use advertising IDs or third-party advertising trackers.',
      },
      {
        title: '4. App permissions & device access',
        body: 'KinBech requests device permissions only when needed for a feature you use. Optional permissions can be denied — core browsing still works. Required: network access and a Google account to sign in. Optional: location (when in use), camera, photo library, microphone (voice calls, voice messages, voice search, listing video), incoming-call permissions, and push notifications. A full permission table is available in Settings → Privacy & Security → App permissions & data use. We never record calls, and we do not use background location, contacts, SMS, or call logs.',
      },
      {
        title: '5. Location data',
        body: 'If you tap "Use Current Location" we request foreground ("When In Use") location permission, turn it into a city/district, and may store coordinates on your profile, listing, or shop. On Home and Explore, your location is sent with the request to find and sort nearby listings; it is not saved to your profile unless you save it. Other users see only the area you choose to show, never your exact coordinates. Turn off "Show location" in Privacy & Security to hide your area, or revoke the permission in device Settings → KinBech → Location.',
      },
      {
        title: '6. Live activity',
        body: 'While KinBech is open on your phone, the app tells our servers which screen you are on — for example Home, a listing, a shop, a search, or a chat — and checks in about every 30 seconds. With it we record the listing, shop, or person on that screen (and their title, price, or name), your search words or category, the screens you moved through during this visit, when the visit started, and your device name, platform, app version, IP address, and install ID. This shows KinBech staff how many people are using the app right now and helps us find problems on specific screens and support you faster. It is visible only to authorised KinBech staff, never to other users. It works whether or not you are signed in. The record is removed about 2 minutes after you close or leave the app. We also update the time you were last active on your account.',
      },
      {
        title: '7. How we use information',
        body: 'We use data to: create and secure your account; show, rank, and recommend listings near you; run chat, voice messages, voice calls, meetups, and reviews; ring incoming calls and send the notifications you allow; suggest listing details from your photos when you use auto-fill; activate posting plans and boosts you buy or earn; check listings, photos, chats, and documents for prohibited content, scams, and fraud; verify shops; give sellers view and sales statistics; provide customer support; comply with law; and improve the service using aggregated statistics.',
      },
      {
        title: '8. Recommendations & notifications',
        body: 'When you view, save, or chat about a listing, open a category, or search, we keep an interest profile (favourite categories, common words, and usual price range) that fades over time. It is used to order Home and search results and to choose daily updates. Daily updates are at most a few pushes a day — for example buyers waiting for your reply, views on your items, or new items near you — and can be turned off in Settings → Daily updates. Sellers who boost a listing get a summary of the views it received. The interest profile is deleted with your account.',
      },
      {
        title: '9. Automated safety checks',
        body: 'To keep KinBech safe, some checks run automatically on our own servers. Listing photos: checked for nudity and adult content, for stock or watermarked catalogue photos and weapon text (by reading text in the image), and compared with photos in other sellers\' listings to catch copied photos. Listings: checked for duplicates, posting limits, restricted words, and prices far from similar listings. Chat: messages with known abusive words are blocked; phrases that often mean a scam are flagged for review; and phrases such as "sold" or "I got it" update the deal status and whether the item still looks available. Accounts: we look for accounts that appear linked to one person (same install, same network and device model in the last 30 days, or the same listing photo), several reports from different people, and listings that are probably already sold. Possible results are a listing sent to review or ranked lower, a listing hidden until the seller confirms it is still available (one tap), a temporary chat restriction, or a warning. Strikes and suspensions are always decided by a person. Flagged chats and reported content may be read by our moderators. If you think a decision is wrong, contact support.',
      },
      {
        title: '10. Posting plans & payments',
        body: 'Posting plans are optional and paid through eSewa. eSewa handles the payment; we receive the payment ID, amount, status, and plan details, never your eSewa password or PIN. Plan payments are listed under Plan bills in the app. Featured credits you earn by inviting friends are recorded on your account. KinBech does not process payments for items — buyers and sellers pay each other directly, and the payment methods you save are shared only as described in section 11.',
      },
      {
        title: '11. What other people can see',
        body: 'Anyone using KinBech can see your public profile: name, photo, bio, the area you choose to show, when you joined, listings, ratings and reviews, your trust level, typical reply time, completed deals, and when you were last active. People you chat with also see when you are online, typing, or were last seen. Your phone number is shown only if you turn on "Show phone number". A shop page shows its name, logo, address, hours, products, accepted payment methods, verified badge, and view and sales highlights; PAN/VAT numbers and business documents are never shown publicly.',
      },
      {
        title: '12. Sharing & disclosure',
        body: 'We do not sell your personal data and we do not share it for advertising. We share: (a) with other users, as described in section 11, and messages with people you contact; (b) with service providers who process data for us (section 13); (c) when required by law, or to protect users and the public from fraud or harm.',
      },
      {
        title: '13. Service providers',
        body: 'Google — Google Sign-In, Firebase Cloud Messaging (push notifications and incoming calls), on-device speech recognition for voice search, and the Gemini API (the listing photos and text you submit when you use auto-fill, processed under Google\'s API terms). Agora — streams voice call audio in real time; calls are not recorded. eSewa — processes posting plan payments. Cloudflare — R2 storage for photos, videos, voice messages, and documents you upload, and Turnstile, a human check shown only when sign-in traffic looks unusual. MongoDB Atlas — our database. Cloud server hosting for the KinBech API. Sentry (when enabled) — error reports. OpenStreetMap — map tiles on the website map, loaded directly by your browser. Each provider receives only what it needs to perform its service. Photo, chat, and fraud checks run on our own servers and are not sent to outside providers.',
      },
      {
        title: '14. Staff access',
        body: 'Only authorised KinBech staff can open the admin tools, and each staff member sees only the areas their role needs. Staff may view account details, listings, reports, flagged chats, payments, and live activity to support you, keep the marketplace safe, and verify shops. Every admin action is recorded in an audit log. KinBech Support may call you inside the app about a report or ticket.',
      },
      {
        title: '15. Data retention & deletion',
        body: 'Live activity: about 2 minutes after you leave the app. Signed-in devices: until you sign out, sign that device out, or the session expires. Auto-fill usage records: 30 days. Account, listings, chats, interest profile, and seller score: while your account exists. When you delete your account (Settings → Privacy & Security → Delete account, or email support@kinbech.com), it is hidden right away and permanently deleted after a 30-day grace period; signing in during those 30 days cancels the request. Backups are purged within 90 days after that, except where law requires longer retention (safety reports up to 5 years, payment and tax records up to 7 years). See the Account Deletion Policy for details.',
      },
      {
        title: '16. Security',
        body: 'We use HTTPS/TLS for all traffic, secure storage for sign-in tokens on your device, encryption at rest (AES-256) for shop PAN/VAT numbers, and private storage with short-lived links for business documents. Production systems use role-based access, rate limits, and automated alerts for unusual sign-in activity. You can see and sign out every device in Privacy & Security. No method is 100% secure; report concerns to support@kinbech.com.',
      },
      {
        title: '17. Your rights & choices',
        body: 'You may request access, correction, deletion, or restriction of your data. In the app you can: edit your profile; hide your phone number or area; block people from messaging or calling you; turn notifications and daily updates on or off; sign out other devices; download a copy of your data ("Download my data"); and delete your account. Device permissions can be revoked in your phone settings. For anything else, email support@kinbech.com from the email of the Google account you sign in with. Nepal and India users may lodge complaints with the relevant data protection authorities if unsatisfied with our response.',
      },
      {
        title: '18. Children',
        body: `KinBech is not for children under ${LEGAL_COMPANY.minAge}. We do not knowingly collect data from minors. Contact us to request deletion if a child created an account.`,
      },
      {
        title: '19. Website & cookies',
        body: 'The KinBech website does not use advertising or analytics cookies, and the public pages store nothing in your browser. Browser storage is used only to keep authorised staff signed in to the admin panel.',
      },
      {
        title: '20. International transfers',
        body: 'Our servers and the service providers listed above may store or process data outside Nepal. We use providers that protect data with industry-standard safeguards.',
      },
      {
        title: '21. Changes',
        body: 'We may update this policy as KinBech changes. Material changes will be notified in-app or by email at least 30 days before taking effect. Continued use after the effective date means acceptance.',
      },
      {
        title: '22. Contact',
        body: `Data Protection Officer: ${LEGAL_COMPANY.privacyEmail}. Postal: ${LEGAL_COMPANY.name}, Attn: DPO, ${LEGAL_COMPANY.address}.`,
      },
    ],
  },

  terms: {
    title: 'Terms & Conditions',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Questions?',
      body: `Email ${LEGAL_COMPANY.supportEmail}, call ${LEGAL_COMPANY.supportPhone}, or use Contact Us in the app. Support hours: 8 AM – 10 PM NPT daily.`,
    },
    sections: [
      {
        title: '1. Acceptance',
        body: `By using KinBech you agree to these Terms, our Privacy Policy, Community Guidelines, and App Permissions disclosure. Operator: ${LEGAL_COMPANY.name}, ${LEGAL_COMPANY.address}.`,
      },
      {
        title: '2. Eligibility',
        body: `You must be at least ${LEGAL_COMPANY.minAge} years old and able to form a binding contract in Nepal or India. One account per person. You are responsible for activity on your account and keeping the Google account you sign in with secure.`,
      },
      {
        title: '3. Marketplace Role',
        body: 'KinBech is a classifieds / peer-to-peer marketplace platform. We are not the seller, buyer, broker, escrow agent, or delivery company. We do not guarantee item quality, authenticity, or user identity beyond optional verification badges.',
      },
      {
        title: '4. User Conduct',
        body: 'Do not: harass, scam, impersonate, post illegal/prohibited items, spam, scrape data, use bots, run several accounts, circumvent security or limits, or interfere with other users. See Community Guidelines for detailed rules.',
      },
      {
        title: '5. Listings & Prohibited Items',
        body: 'List only items you legally own. Accurate photos, prices, and location required. Prohibited: stolen/counterfeit goods, weapons, drugs, endangered species products, adult services, financial scams, and anything illegal in Nepal or India. Listings may be checked automatically and by moderators before or after they go live, and may be ranked lower or hidden when they look sold, out of stock, or misleading.',
      },
      {
        title: '6. Transactions & Payments',
        body: 'Deals happen directly between users (cash, eSewa, Khalti, IME Pay, bank transfer, etc.). KinBech does not hold funds or guarantee payment. Inspect items before paying. Meet in public places.',
      },
      {
        title: '7. Posting Plans, Boosts & Limits',
        body: 'Browsing, chatting, and calling are free, and sellers get free posts every day. Optional posting plans raise your daily post limit for the period shown before you pay, and are paid through eSewa. Boosts and featured credits (including credits earned by inviting friends) feature a listing for a limited time and have no cash value. In-app calls may have a daily talk-time limit. Prices, limits, and plan features may change; changes never shorten a plan you already paid for.',
      },
      {
        title: '8. User Content License',
        body: 'You keep ownership of photos and text you post. You grant KinBech a license to host, display, and promote your content to operate the service.',
      },
      {
        title: '9. Reviews',
        body: 'Reviews must be honest and based on real transactions. Fake or paid reviews may lead to suspension.',
      },
      {
        title: '10. Enforcement, Suspension & Termination',
        body: 'We may remove content, limit features, or suspend accounts that violate these Terms or pose safety risks. Several reports from different people may temporarily restrict chat automatically. Strikes are given by moderators: 1 strike is a warning, 2 strikes a 7-day suspension, 3 or more a permanent suspension. Suspension signs you out and hides your active listings. You may delete your account anytime (see Account Deletion Policy).',
      },
      {
        title: '11. Disclaimers',
        body: 'THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES. WE DO NOT WARRANT UNINTERRUPTED OR ERROR-FREE OPERATION.',
      },
      {
        title: '12. Limitation of Liability',
        body: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, KINBECH IS NOT LIABLE FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES FROM USER TRANSACTIONS OR THIRD-PARTY CONDUCT. TOTAL LIABILITY IS LIMITED TO FEES PAID TO US IN THE PRIOR 12 MONTHS.',
      },
      {
        title: '13. Disputes & Governing Law',
        body: 'Disputes between users should be resolved directly. For disputes with KinBech, governing law is the laws of Nepal. Courts in Kathmandu, Nepal have primary jurisdiction unless local consumer law requires otherwise.',
      },
      {
        title: '14. Google Play',
        body: 'KinBech is distributed through Google Play, so Google Play terms also apply to your download. These Terms are between you and KinBech, not Google.',
      },
      {
        title: '15. Changes',
        body: 'Material Term changes will be notified at least 30 days in advance via in-app notice or email. Continued use means acceptance.',
      },
    ],
  },

  permissions: {
    title: 'App Permissions & Data Use',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Google Play Data safety',
      body: 'This page matches our Google Play Data safety form. We collect: personal info (name, email, Google account ID, optional phone, address/area), photos and videos, messages and voice messages, approximate and precise location (optional, when in use), purchase history (posting plans), app activity (screens viewed, searches, listings viewed or saved), app info and performance (crash and error reports), and device IDs (random install ID and push token). Call audio is streamed, never stored. Data is encrypted in transit, we do not sell it or use it for ads, and deletion is available in-app and by email.',
    },
    sections: [
      {
        title: '1. Overview',
        body: 'KinBech asks for permissions only to provide marketplace features. Denying optional permissions limits related features but does not block basic browsing.',
      },
      {
        title: '2. Permissions we request',
        body: APP_PERMISSIONS.map(
          (p) =>
            `${p.name} (${p.optional ? 'Optional' : 'Required'})\nWhen: ${p.when}\nWhy: ${p.why}\nData: ${p.data}\nAndroid: ${p.android}`,
        ).join('\n\n'),
      },
      {
        title: '3. Permissions we do NOT use',
        body: PERMISSIONS_NOT_USED.map((line) => `• ${line}`).join('\n'),
      },
      {
        title: '4. How to revoke',
        body: 'Settings → Apps → KinBech → Permissions on your Android phone. You can also toggle visibility (phone, location on profile) inside KinBech → Settings → Privacy & Security, and Notifications or Daily updates in Settings.',
      },
      {
        title: '5. Data collected without a pop-up',
        body: 'Name, email, and photo from Google sign-in; profile info you type; listing content; chat messages; listings you view, save, or search for; the screen you have open while the app is in use (live activity, removed about 2 minutes after you leave); and device name, platform, app version, install ID, and IP address sent with every request.',
      },
    ],
  },

  community: {
    title: 'Community Guidelines',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Report violations',
      body: 'Open a listing, profile, or chat → Report, or email support@kinbech.com. Repeat offenders are suspended.',
    },
    sections: [
      {
        title: '1. Be respectful',
        body: 'Treat buyers and sellers politely. No hate speech, threats, discrimination, or harassment. Messages with abusive words are blocked automatically.',
      },
      {
        title: '2. Be honest',
        body: 'Use real photos of the actual item — copied or stock photos are detected and sent to review. Disclose defects, accurate price, and genuine location. No bait-and-switch. Mark items sold and keep shop stock up to date.',
      },
      {
        title: '3. Safe meetups',
        body: 'Meet in public, daylight when possible. Bring a friend for high-value deals. Inspect before payment. Never share OTPs or PINs.',
      },
      {
        title: '4. Prohibited content',
        body: 'No illegal goods, weapons, drugs, counterfeit items, stolen property, adult content, pyramid schemes, or misleading financial offers.',
      },
      {
        title: '5. No spam or scams',
        body: 'One account per person. No fake listings, duplicate posts, phishing links, advance-payment traps, or mass unsolicited messages.',
      },
      {
        title: '6. Shops & individuals',
        body: 'Shops must represent a real business. Individuals must not impersonate shops. Verified badges are earned — do not forge them.',
      },
      {
        title: '7. Enforcement',
        body: 'Automated checks and moderators may send listings to review, hide them, or temporarily restrict chat. Moderators may remove content and give strikes: a warning, then a 7-day suspension, then a permanent ban. Serious illegal activity may be reported to authorities.',
      },
    ],
  },

  accountDeletion: {
    title: 'Account Deletion Policy',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Need help deleting?',
      body: `Email ${LEGAL_COMPANY.privacyEmail} with subject "Delete my account" from the email of the Google account you sign in with. We confirm within 7 business days.`,
    },
    sections: [
      {
        title: '1. Your right to delete',
        body: 'You can request deletion of your KinBech account and associated personal data at any time, as required by Google Play and applicable privacy laws.',
      },
      {
        title: '2. Delete in the app',
        body: 'Path: Profile → Settings → Privacy & Security → scroll to "Delete account" → Delete my account → confirm. You are signed out on every device and your listings and shop are hidden right away. Signing in again within 30 days cancels the request; after 30 days your profile, listings, shop, and personal preferences are permanently deleted. Use "Download my data" first if you want a copy.',
      },
      {
        title: '3. Delete by email',
        body: `No app? Email ${LEGAL_COMPANY.privacyEmail} from the email address of the Google account you use on KinBech. Include your full name and "Please delete my account". We verify ownership before processing.`,
      },
      {
        title: '4. What is deleted',
        body: 'Your Google account link, email, name, photo, phone number, bio, location, saved addresses and payment details, preferences, listings, shop profile and verification documents, wishlist, notifications, signed-in devices, support tickets, interest profile, seller score, and live activity. In chats, your messages and voice messages are replaced with "Message removed" and your name shows as "Deleted user". Reviews you wrote stay, also shown as "Deleted user".',
      },
      {
        title: '5. What may be retained',
        body: 'Data we must keep by law or for safety: fraud/safety reports (up to 5 years), posting plan payment and tax records (up to 7 years), the admin audit log, and anonymized statistics that cannot identify you.',
      },
      {
        title: '6. Timeline',
        body: 'Your account is hidden as soon as you confirm. It is permanently deleted from our live systems after the 30-day grace period. Backups are purged within 90 days after that.',
      },
      {
        title: '7. Re-registration',
        body: 'After deletion is complete you may create a new account with the same Google account, subject to our anti-abuse checks.',
      },
    ],
  },

  refund: {
    title: 'Refund & Cancellation Policy',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Posting plans',
      body: `Signing in, browsing, chatting and calling are free, and sellers get free posts every day. Optional posting plans are paid through eSewa inside the app. If you were charged but your plan did not turn on, or you were charged twice, contact ${LEGAL_COMPANY.supportEmail} or ${LEGAL_COMPANY.supportPhone} with your eSewa transaction ID.`,
    },
    sections: [
      {
        title: '1. Peer-to-peer sales',
        body: 'KinBech does not process item payments. Refunds for bought/sold goods are arranged directly between buyer and seller. We recommend agreeing on refund conditions before payment for high-value items.',
      },
      {
        title: '2. Listing cancellation',
        body: 'Sellers may delete or mark listings as sold anytime from My Listings. Buyers cancel by not proceeding with the meetup — no in-app order to cancel.',
      },
      {
        title: '3. Disputes',
        body: 'If a deal goes wrong, document chat and photos, report the user in-app, and contact local consumer protection or police for fraud. KinBech may suspend accounts but is not a party to private sales.',
      },
      {
        title: '4. Posting plans',
        body: 'Plan prices, daily post limits and duration are shown in the app before you pay. A plan starts as soon as eSewa confirms the payment, and every payment appears under Plan bills in the app.',
      },
      {
        title: '5. Plan refunds',
        body: 'If eSewa took your money but the plan did not start, we start the plan or refund the full amount to the same eSewa account. Duplicate charges are refunded in full. Once a plan has started it cannot be cancelled for a partial refund, except where law requires. Refunds are usually completed within 7 business days after we confirm the payment with eSewa.',
      },
      {
        title: '6. Boosts & featured credits',
        body: 'Boosts and featured credits, including credits earned by inviting friends, have no cash value and cannot be refunded or exchanged. If a listing is removed for breaking the rules, any boost on it ends without a refund.',
      },
    ],
  },

  childSafety: {
    title: 'Child Safety Standards',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Report urgently',
      body: 'Report child safety concerns immediately via in-app Report or email support@kinbech.com.',
    },
    sections: [
      {
        title: '1. Age requirement',
        body: `KinBech is for users aged ${LEGAL_COMPANY.minAge} and above only. We do not target children.`,
      },
      {
        title: '2. Prohibited content',
        body: 'Zero tolerance for child sexual abuse material (CSAM), grooming, or exploitation. Such content is removed and reported to authorities.',
      },
      {
        title: '3. Parental notice',
        body: 'If you believe a minor is using KinBech, contact support@kinbech.com and we will investigate and delete the account.',
      },
      {
        title: '4. Moderation',
        body: 'Uploaded photos are checked automatically for nudity and adult content, chats are filtered for sexual harassment terms, and users can report profiles, listings, and chats. Our team reviews reports and cooperates with law enforcement when required.',
      },
    ],
  },
};

export const LEGAL_LINKS = [
  { key: 'privacy', label: 'Privacy Policy', subtitle: 'How we collect and use data', icon: 'document-text-outline' },
  { key: 'terms', label: 'Terms & Conditions', subtitle: 'Rules for using KinBech', icon: 'shield-checkmark-outline' },
  { key: 'permissions', label: 'App Permissions & Data Use', subtitle: 'What we access on your device', icon: 'phone-portrait-outline' },
  { key: 'community', label: 'Community Guidelines', subtitle: 'Safe & respectful marketplace', icon: 'people-outline' },
  { key: 'accountDeletion', label: 'Account Deletion Policy', subtitle: 'How to delete your data', icon: 'trash-outline' },
  { key: 'refund', label: 'Refund & Cancellation', subtitle: 'Plans, boosts and peer-to-peer deals', icon: 'cash-outline' },
  { key: 'childSafety', label: 'Child Safety Standards', subtitle: 'Protection of minors', icon: 'heart-outline' },
];

export function getLegalDocument(key) {
  return LEGAL_DOCUMENTS[key] || null;
}
