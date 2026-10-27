export const LEGAL_LAST_UPDATED = 'October 2026';

export const LEGAL_COMPANY = {
  name: 'KinBech Pvt. Ltd.',
  address: 'Gairidhara - 2, Kathmandu 44600, Bagmati Province, Nepal',
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
    ios: 'Not a device permission — shared by Google when you sign in',
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
    ios: 'Not a device permission — typed by you',
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
    ios: 'NSLocationWhenInUseUsageDescription',
    required: false,
    when: 'Home, Explore, posting a listing, profile setup, shop creation',
    why: 'Show listings near you, sort by distance, and auto-fill city/district on your profile or listing.',
    data: 'Approximate coordinates may be sent to our servers when you save location on profile or post a listing. Browsing-only location is used for sorting and is not stored on your profile unless you save it.',
    optional: true,
  },
  {
    id: 'photos',
    name: 'Photos & media library',
    android: 'Android photo picker (no gallery permission on Android 13+); READ_EXTERNAL_STORAGE on Android 12 and below',
    ios: 'NSPhotoLibraryUsageDescription',
    required: false,
    when: 'Profile photo, listing photos, shop logo, shop verification documents',
    why: 'Let you upload images for your profile, product listings, and shop.',
    data: 'Only the images you pick are uploaded and linked to your account or listings. We do not scan your gallery.',
    optional: true,
  },
  {
    id: 'camera',
    name: 'Camera',
    android: 'CAMERA',
    ios: 'NSCameraUsageDescription',
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
    ios: 'NSMicrophoneUsageDescription, NSSpeechRecognitionUsageDescription',
    required: false,
    when: 'Voice calls, voice messages in chat, voice search, and listing video sound',
    why: 'Let you talk to buyers and sellers, send voice notes, and search by speaking.',
    data: 'Call audio is streamed live through our calling provider (Agora) and is never recorded. Voice messages are uploaded and kept with the chat. Voice search is turned into text by your device speech service (Google); only the text reaches KinBech.',
    optional: true,
  },
  {
    id: 'calls',
    name: 'Incoming calls & background calling',
    android: 'MANAGE_OWN_CALLS, FOREGROUND_SERVICE_PHONE_CALL, FOREGROUND_SERVICE_MICROPHONE, USE_FULL_SCREEN_INTENT, WAKE_LOCK, VIBRATE, SYSTEM_ALERT_WINDOW, DISABLE_KEYGUARD, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    ios: 'Not applicable',
    required: false,
    when: 'When someone calls you on KinBech, and while a call is active',
    why: 'Ring and show the incoming call screen even when the phone is locked or the app is closed, and keep the call connected when you switch apps. Battery optimisation is turned off only if you approve it.',
    data: 'No extra data is collected. These permissions only control how calls ring and stay connected.',
    optional: true,
  },
  {
    id: 'notifications',
    name: 'Notifications',
    android: 'POST_NOTIFICATIONS (Android 13+)',
    ios: 'Push notification permission (when enabled)',
    required: false,
    when: 'If you enable notifications in Settings',
    why: 'Send incoming calls, chat replies, listing activity, and safety alerts.',
    data: 'A device push token is stored and used through Firebase Cloud Messaging (Google) to deliver notifications. You can disable them anytime in Settings.',
    optional: true,
  },
  {
    id: 'internet',
    name: 'Network access',
    android: 'INTERNET',
    ios: 'Standard network access',
    required: true,
    when: 'Always while using the app',
    why: 'Load listings, chat, and account data from KinBech servers.',
    data: 'IP address and request metadata may be logged for security.',
    optional: false,
  },
];

export const PERMISSIONS_NOT_USED = [
  'Call recording — calls are never recorded',
  'Background location — not collected',
  'Contacts / address book — not accessed',
  'SMS and call logs — not accessed',
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
        body: `KinBech ("we", "us", "our") operates the KinBech mobile application and website (${LEGAL_COMPANY.website}). This Privacy Policy explains what personal data we collect, why we collect it, how we use and share it, and your rights. By using KinBech you agree to this policy. Minimum age: ${LEGAL_COMPANY.minAge} years.`,
      },
      {
        title: '2. Information We Collect',
        body: 'Account data: from Google sign-in — your Google account ID, email, name, and profile photo; plus an optional phone number, optional city/district location, seller type (individual/shop), referral code, and preferences (language, currency, notification toggles, visibility settings). Shop data: shop name, logo, address, and — if you request a verified badge — PAN/VAT number and business documents. Listing data: titles, descriptions, prices, categories, photos, optional video, meetup preferences, and listing location. Communication data: chat messages, voice messages, call history (who called, when, and how long — never the call audio), reviews, reports, and support tickets. Saved payment details: eSewa, Khalti, IME Pay, or bank details you choose to save so buyers can pay you. Technical data: device model, OS version, app version, push token, IP address, crash logs, and interaction events. We do not collect card numbers and we do not process payments — deals are paid directly between users.',
      },
      {
        title: '3. App Permissions & Device Access',
        body: 'KinBech requests device permissions only when needed for a feature you use. Optional permissions can be denied — core browsing still works. Required: network access and a Google account to sign in. Optional: location (when in use), camera, photo library, microphone (voice calls, voice messages, voice search, listing video), incoming-call permissions, and push notifications. A full permission table is available in Settings → App Permissions & Data Use. We never record calls, and we do not use background location, contacts, SMS, or call logs.',
      },
      {
        title: '4. Location Data',
        body: 'If you tap "Use Current Location" we request foreground ("When In Use") location permission, reverse-geocode to city/district, and may store coordinates on your profile or listing. On Home/Explore, location sorts nearby results; it is not saved to your profile unless you explicitly save location. Revoke anytime: device Settings → KinBech → Location → Off.',
      },
      {
        title: '5. How We Use Information',
        body: 'We use data to: create and secure your account (Google sign-in); show and rank listings; enable buyer–seller chat, voice messages, and voice calls; ring incoming calls and send notifications you opt into; suggest listing details from your photos when you use auto-fill; check listings and documents for prohibited content and fraud; verify shops; provide customer support; comply with law; and improve the service using aggregated analytics.',
      },
      {
        title: '6. Sharing & Disclosure',
        body: 'We do not sell your personal data. We share: (a) with other users — your public profile, listings, reviews, and messages with people you contact; phone number only if you enable "Show phone number" in Privacy settings; (b) with service providers who process data for us under contract (see "Service providers" below); (c) when required by law or to protect safety.',
      },
      {
        title: '7. Service providers',
        body: 'Google — Google Sign-In, Firebase Cloud Messaging (push notifications and incoming calls), and Gemini AI (the listing photos and text you submit when you use auto-fill). Agora — streams voice call audio in real time; calls are not recorded. Cloudflare R2 — stores photos, videos, voice messages, and documents you upload. MongoDB Atlas — our database. Cloud server hosting for the KinBech API. Error monitoring (Sentry, when enabled) — crash and error reports. Each provider receives only what it needs to perform its service.',
      },
      {
        title: '8. Data Retention & Deletion',
        body: 'Active account data is kept while your account exists. When you delete your account (Settings → Privacy & Security → Delete account, or email support@kinbech.com), it is hidden right away and permanently deleted after a 30-day grace period. Signing in during those 30 days cancels the request. Backups are purged within 90 days after that, except where law requires longer retention (e.g. safety reports, tax records). See the Account Deletion Policy for step-by-step instructions.',
      },
      {
        title: '9. Security',
        body: 'We use HTTPS/TLS for API traffic, encrypted storage for auth tokens on device, access controls on production systems, and role-based admin access. No method is 100% secure; report concerns to support@kinbech.com.',
      },
      {
        title: '10. Your Rights',
        body: 'You may request access, correction, deletion, or restriction of your data. Update profile fields in-app, and use "Download my data" in Settings → Privacy & Security for a copy. For anything else, email support@kinbech.com from the email of the Google account you sign in with. Nepal and India users may lodge complaints with relevant data protection authorities if unsatisfied with our response.',
      },
      {
        title: '11. Children',
        body: `KinBech is not for children under ${LEGAL_COMPANY.minAge}. We do not knowingly collect data from minors. Contact us to request deletion if a child created an account.`,
      },
      {
        title: '12. International Transfers',
        body: 'Our servers and the service providers listed above may store or process data outside Nepal. We use providers that protect data with industry-standard safeguards.',
      },
      {
        title: '13. Changes',
        body: 'We may update this policy. Material changes will be notified in-app or by email at least 30 days before taking effect. Continued use after the effective date means acceptance.',
      },
      {
        title: '14. Contact',
        body: `Data Protection Officer: ${LEGAL_COMPANY.privacyEmail}. Postal: ${LEGAL_COMPANY.name}, Attn: DPO, ${LEGAL_COMPANY.address}.`,
      },
    ],
  },

  terms: {
    title: 'Terms & Conditions',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Questions?',
      body: `Contact ${LEGAL_COMPANY.supportEmail} or use Contact Us in the app. Support hours: 8 AM – 10 PM NPT daily.`,
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
        body: 'Do not: harass, scam, impersonate, post illegal/prohibited items, spam, scrape data, use bots, circumvent security, or interfere with other users. See Community Guidelines for detailed rules.',
      },
      {
        title: '5. Listings & Prohibited Items',
        body: 'List only items you legally own. Accurate photos, prices, and location required. Prohibited: stolen/counterfeit goods, weapons, drugs, endangered species products, adult services, financial scams, and anything illegal in Nepal or India.',
      },
      {
        title: '6. Transactions & Payments',
        body: 'Deals happen directly between users (cash, eSewa, Khalti, IME Pay, bank transfer, etc.). KinBech does not hold funds or guarantee payment. Inspect items before paying. Meet in public places.',
      },
      {
        title: '7. User Content License',
        body: 'You keep ownership of photos and text you post. You grant KinBech a license to host, display, and promote your content to operate the service.',
      },
      {
        title: '8. Reviews',
        body: 'Reviews must be honest and based on real transactions. Fake or paid reviews may lead to suspension.',
      },
      {
        title: '9. Account Suspension & Termination',
        body: 'We may suspend or remove accounts or listings that violate these Terms or pose safety risks. You may delete your account anytime (see Account Deletion Policy).',
      },
      {
        title: '10. Disclaimers',
        body: 'THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES. WE DO NOT WARRANT UNINTERRUPTED OR ERROR-FREE OPERATION.',
      },
      {
        title: '11. Limitation of Liability',
        body: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, KINBECH IS NOT LIABLE FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES FROM USER TRANSACTIONS OR THIRD-PARTY CONDUCT. TOTAL LIABILITY IS LIMITED TO FEES PAID TO US IN THE PRIOR 12 MONTHS (CURRENTLY ZERO FOR STANDARD USE).',
      },
      {
        title: '12. Disputes & Governing Law',
        body: 'Disputes between users should be resolved directly. For disputes with KinBech, governing law is the laws of Nepal. Courts in Kathmandu, Nepal have primary jurisdiction unless local consumer law requires otherwise.',
      },
      {
        title: '13. Google Play / App Store',
        body: 'If you downloaded KinBech from Google Play or Apple App Store, their store terms also apply. These Terms are between you and KinBech, not Google or Apple.',
      },
      {
        title: '14. Changes',
        body: 'Material Term changes will be notified at least 30 days in advance via in-app notice or email. Continued use means acceptance.',
      },
    ],
  },

  permissions: {
    title: 'App Permissions & Data Use',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Google Play Data safety',
      body: 'This page matches our Google Play Data safety form: we collect account info (name, email, optional phone), photos and videos, messages and voice messages, location (optional), saved payment details (optional), device push token, and crash logs. Call audio is streamed, never stored. Data is encrypted in transit and we do not sell it. Deletion is available in-app and by email.',
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
            `${p.name} (${p.optional ? 'Optional' : 'Required'})\nWhen: ${p.when}\nWhy: ${p.why}\nData: ${p.data}\nAndroid: ${p.android}\niOS: ${p.ios}`,
        ).join('\n\n'),
      },
      {
        title: '3. Permissions we do NOT use',
        body: PERMISSIONS_NOT_USED.map((line) => `• ${line}`).join('\n'),
      },
      {
        title: '4. How to revoke',
        body: 'Android: Settings → Apps → KinBech → Permissions. iOS: Settings → KinBech. You can also toggle visibility (phone, location on profile) inside KinBech → Settings → Privacy & Security.',
      },
      {
        title: '5. Data collected without a pop-up',
        body: 'Name, email, and photo from Google sign-in, profile info you type, listing content, chat messages, and basic device/network metadata sent automatically with API requests.',
      },
    ],
  },

  community: {
    title: 'Community Guidelines',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Report violations',
      body: 'Open a listing or chat → Report, or email support@kinbech.com. Repeat offenders are suspended.',
    },
    sections: [
      {
        title: '1. Be respectful',
        body: 'Treat buyers and sellers politely. No hate speech, threats, discrimination, or harassment.',
      },
      {
        title: '2. Be honest',
        body: 'Use real photos of the actual item. Disclose defects, accurate price, and genuine location. No bait-and-switch.',
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
        body: 'One account per person. No fake listings, phishing links, off-platform payment traps, or mass unsolicited messages.',
      },
      {
        title: '6. Shops & individuals',
        body: 'Shops must represent a real business. Individuals must not impersonate shops. Verified badges are earned — do not forge them.',
      },
      {
        title: '7. Enforcement',
        body: 'We may remove content, warn users, or ban accounts. Serious illegal activity may be reported to authorities.',
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
        body: 'Your Google account link, email, name, photo, phone number, saved addresses and payment details, preferences, listings, shop profile, and shop verification documents. In chats, your messages and voice messages are replaced with "Message removed" and your name shows as "Deleted user". Reviews you wrote stay, also shown as "Deleted user".',
      },
      {
        title: '5. What may be retained',
        body: 'Data we must keep by law: fraud/safety reports (up to 5 years), financial/tax records if applicable (up to 7 years), and anonymized analytics that cannot identify you.',
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
      title: 'Platform fees',
      body: 'KinBech standard marketplace use is currently free. If paid promotions launch, refund terms will be shown before purchase.',
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
        title: '4. Future paid features',
        body: 'Any future KinBech subscription or promoted listing fees will include clear pricing and applicable refund rules before you pay.',
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
        body: 'Users can report profiles and listings. Our team reviews reports and cooperates with law enforcement when required.',
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
  { key: 'refund', label: 'Refund & Cancellation', subtitle: 'Peer-to-peer deal policies', icon: 'cash-outline' },
  { key: 'childSafety', label: 'Child Safety Standards', subtitle: 'Protection of minors', icon: 'heart-outline' },
];

export function getLegalDocument(key) {
  return LEGAL_DOCUMENTS[key] || null;
}
