export const LEGAL_LAST_UPDATED = 'March 2026';

export const LEGAL_COMPANY = {
  name: 'KinBech Pvt. Ltd.',
  address: 'Gairidhara - 2, Kathmandu 44600, Bagmati Province, Nepal',
  supportEmail: 'support@kinbech.app',
  privacyEmail: 'privacy@kinbech.app',
  legalEmail: 'legal@kinbech.app',
  website: 'https://kinbech.app',
  appPackage: 'com.codersalpha1.kinbech',
  minAge: 16,
};

/** Play Store / Data safety aligned permission disclosures */
export const APP_PERMISSIONS = [
  {
    id: 'phone',
    name: 'Phone number',
    android: 'Not a device permission — collected when you sign up',
    ios: 'Not a device permission — collected when you sign up',
    required: true,
    when: 'Account creation & OTP login',
    why: 'To create your account, verify your identity via SMS OTP, and secure login.',
    data: 'Phone number stored on our servers while your account is active.',
    optional: false,
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
    android: 'READ_MEDIA_IMAGES / READ_EXTERNAL_STORAGE (Android version dependent)',
    ios: 'NSPhotoLibraryUsageDescription',
    required: false,
    when: 'Profile photo, listing photos, shop logo',
    why: 'Let you upload images for your profile and product listings.',
    data: 'Selected images are uploaded to our servers and linked to your account/listings. We do not scan your entire gallery.',
    optional: true,
  },
  {
    id: 'video',
    name: 'Videos (media library)',
    android: 'READ_MEDIA_VIDEO (when supported)',
    ios: 'Photo library video access',
    required: false,
    when: 'Optional listing video upload',
    why: 'Allow sellers to attach one short product video to a listing.',
    data: 'Only the video you explicitly select is uploaded.',
    optional: true,
  },
  {
    id: 'notifications',
    name: 'Notifications',
    android: 'POST_NOTIFICATIONS (Android 13+)',
    ios: 'Push notification permission (when enabled)',
    required: false,
    when: 'If you enable notifications in Settings',
    why: 'Send chat replies, listing activity, and safety alerts.',
    data: 'Device push token stored to deliver notifications. You can disable anytime in Settings.',
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
  'Microphone / audio recording (RECORD_AUDIO) — not used by KinBech',
  'Background location — not collected',
  'Contacts / address book — not accessed',
  'SMS read/send — OTP is entered manually; we do not read your SMS inbox',
  'Camera capture — currently only photo library picker is used; camera opens only if enabled in a future update',
  'Calendar, Bluetooth, body sensors — not used',
];

export const LEGAL_DOCUMENTS = {
  privacy: {
    title: 'Privacy Policy',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Data requests',
      body: `To export, correct, or delete your personal data, email ${LEGAL_COMPANY.privacyEmail} from your registered contact or include your verified phone number. We respond within 30 days.`,
    },
    sections: [
      {
        title: '1. Introduction',
        body: `KinBech ("we", "us", "our") operates the KinBech mobile application and website (${LEGAL_COMPANY.website}). This Privacy Policy explains what personal data we collect, why we collect it, how we use and share it, and your rights. By using KinBech you agree to this policy. Minimum age: ${LEGAL_COMPANY.minAge} years.`,
      },
      {
        title: '2. Information We Collect',
        body: 'Account data: verified phone number, display name, optional profile photo, optional city/district location, seller type (individual/shop), and preferences (language, currency, notification toggles, visibility settings). Listing data: titles, descriptions, prices, categories, photos, optional video, meetup preferences, and listing location. Communication data: in-app chat messages and support tickets. Technical data: device model, OS version, app version, IP address, crash logs, and interaction events. We do not collect payment card numbers inside the app — payments happen directly between users at meetup.',
      },
      {
        title: '3. App Permissions & Device Access',
        body: 'KinBech requests device permissions only when needed for a feature you use. Optional permissions can be denied — core browsing still works. Required: network access and phone number at signup. Optional: location (when in use), photo library, video library, and push notifications. A full permission table is available in Settings → App Permissions & Data Use. We do not use microphone/audio recording, background location, contacts, or SMS inbox access.',
      },
      {
        title: '4. Location Data',
        body: 'If you tap "Use Current Location" we request foreground ("When In Use") location permission, reverse-geocode to city/district, and may store coordinates on your profile or listing. On Home/Explore, location sorts nearby results; it is not saved to your profile unless you explicitly save location. Revoke anytime: device Settings → KinBech → Location → Off.',
      },
      {
        title: '5. How We Use Information',
        body: 'We use data to: create and secure your account (OTP); show and rank listings; enable buyer–seller chat; send notifications you opt into; prevent fraud, spam, and policy violations; provide customer support; comply with law; and improve the service using aggregated analytics.',
      },
      {
        title: '6. Sharing & Disclosure',
        body: 'We do not sell your personal data. We share: (a) with other users — your public profile, listings, and chat messages with people you contact; phone number only if you enable "Show phone number" in Privacy settings; (b) with service providers — cloud hosting, SMS OTP delivery, error monitoring — under confidentiality agreements; (c) when required by law or to protect safety.',
      },
      {
        title: '7. Data Retention & Deletion',
        body: 'Active account data is kept while your account exists. After account deletion (Settings → Privacy & Security → Delete Account, or email privacy@kinbech.app), we delete or anonymize personal data within 90 days except where law requires longer retention (e.g. safety reports, tax records). See Account Deletion Policy in Settings for step-by-step instructions required by Google Play.',
      },
      {
        title: '8. Security',
        body: 'We use HTTPS/TLS for API traffic, encrypted storage for auth tokens on device, access controls on production systems, and role-based admin access. No method is 100% secure; report concerns to privacy@kinbech.app.',
      },
      {
        title: '9. Your Rights',
        body: 'You may request access, correction, deletion, or restriction of your data. Update profile fields in-app. For full export or erasure, contact privacy@kinbech.app with your verified phone number. Nepal and India users may lodge complaints with relevant data protection authorities if unsatisfied with our response.',
      },
      {
        title: '10. Children',
        body: `KinBech is not for children under ${LEGAL_COMPANY.minAge}. We do not knowingly collect data from minors. Contact us to request deletion if a child created an account.`,
      },
      {
        title: '11. International Transfers',
        body: 'Data is primarily processed in Nepal. Some backup or analytics subprocessors may process data in other countries with appropriate safeguards (standard contractual clauses where applicable).',
      },
      {
        title: '12. Changes',
        body: 'We may update this policy. Material changes will be notified in-app or by SMS/email at least 30 days before taking effect. Continued use after the effective date means acceptance.',
      },
      {
        title: '13. Contact',
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
        body: `You must be at least ${LEGAL_COMPANY.minAge} years old and able to form a binding contract in Nepal or India. One account per person. You are responsible for activity on your account and keeping OTP login secure.`,
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
        body: 'Material Term changes will be notified at least 30 days in advance via in-app notice, SMS, or email. Continued use means acceptance.',
      },
    ],
  },

  permissions: {
    title: 'App Permissions & Data Use',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Google Play Data safety',
      body: 'This page matches our Google Play Data safety form: we collect account info, user content, and approximate location (optional). We do not sell data. Deletion is available in-app and by email.',
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
        body: 'Phone number and profile info you type, listing content, chat messages, and basic device/network metadata sent automatically with API requests.',
      },
    ],
  },

  community: {
    title: 'Community Guidelines',
    lastUpdated: LEGAL_LAST_UPDATED,
    footer: {
      title: 'Report violations',
      body: 'Open a listing or chat → Report, or email support@kinbech.app. Repeat offenders are suspended.',
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
      body: `Email ${LEGAL_COMPANY.privacyEmail} with subject "Delete my account" and your registered phone number. We confirm within 7 business days.`,
    },
    sections: [
      {
        title: '1. Your right to delete',
        body: 'You can request deletion of your KinBech account and associated personal data at any time, as required by Google Play and applicable privacy laws.',
      },
      {
        title: '2. Delete in the app',
        body: 'Path: Profile → Settings → Privacy & Security → scroll to "Delete account" → confirm. This starts permanent deletion of your profile, active listings, and personal preferences.',
      },
      {
        title: '3. Delete by email',
        body: `Email ${LEGAL_COMPANY.privacyEmail} from your registered number's contact if possible. Include: full name, phone number (+977…), and "Please delete my account". We verify ownership before processing.`,
      },
      {
        title: '4. What is deleted',
        body: 'Profile name, photo, phone (after retention window), saved preferences, active listings, and shop profile linked to your account. Chat may be anonymized for the other party.',
      },
      {
        title: '5. What may be retained',
        body: 'Data we must keep by law: fraud/safety reports (up to 5 years), financial/tax records if applicable (up to 7 years), and anonymized analytics that cannot identify you.',
      },
      {
        title: '6. Timeline',
        body: 'Account hidden immediately after confirmation. Full deletion from active systems within 90 days. Encrypted backups purged within 6 additional months.',
      },
      {
        title: '7. Re-registration',
        body: 'After deletion you may create a new account with the same phone number once deletion is complete, subject to our anti-abuse checks.',
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
      body: 'Report child safety concerns immediately via in-app Report or email legal@kinbech.app.',
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
        body: 'If you believe a minor is using KinBech, contact privacy@kinbech.app and we will investigate and delete the account.',
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
