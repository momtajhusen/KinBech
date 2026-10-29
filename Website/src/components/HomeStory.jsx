import { Link } from 'react-router-dom';
import { GooglePlayBadge } from './Download';
import MediaRow from './MediaRow';
import Reveal from './Reveal';
import SectionHeader from './SectionHeader';
import SiteImage from './SiteImage';
import { IconShield, IconShop, IconUser } from './Icons';
import BlockRounded from '@mui/icons-material/BlockRounded';
import CallRounded from '@mui/icons-material/CallRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import LockPersonRounded from '@mui/icons-material/LockPersonRounded';
import MapRounded from '@mui/icons-material/MapRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import SocialDistanceRounded from '@mui/icons-material/SocialDistanceRounded';
import StarRateRounded from '@mui/icons-material/StarRateRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';

const STORY = [
  {
    image: 'home-nearby',
    label: 'Nearby first',
    title: 'Deals in your tole, not across the country',
    titleNe: 'आफ्नै टोलमा राम्रो सौदा',
    text: 'Explore sorts listings by distance, so the phone you want might be two streets away. Filter by category, price and condition in Kathmandu, Lalitpur, Pokhara and beyond.',
    points: [
      { icon: SocialDistanceRounded, text: 'Distance shown on every listing', ne: 'हरेक सामानमा दूरी देखिन्छ' },
      { icon: MapRounded, text: 'Map view of sellers around you', ne: 'नक्सामा वरपरका बिक्रेता', tone: 'blue' },
      { icon: TuneRounded, text: 'Category, price and condition filters', ne: 'वर्ग, मूल्य र अवस्था अनुसार फिल्टर', tone: 'violet' },
    ],
    cta: { to: '/explore', label: 'Explore listings' },
  },
  {
    image: 'home-chat',
    label: 'Chat in the app',
    title: 'Ask, bargain and agree without sharing your number',
    titleNe: 'नम्बर नदिई कुरा र मोलमोलाइ',
    neFirst: true,
    text: 'Message the seller inside KinBech. Your phone number stays private until you choose to share it, and the conversation stays on record.',
    points: [
      { icon: LockPersonRounded, text: 'Private until you share', ne: 'तपाईं नचाहेसम्म नम्बर गोप्य' },
      { icon: CallRounded, text: 'Voice calls from the chat', ne: 'च्याटबाटै भ्वाइस कल', tone: 'blue' },
      { icon: BlockRounded, text: 'Report or block in one tap', ne: 'एकै ट्यापमा रिपोर्ट वा ब्लक', tone: 'rose' },
    ],
    cta: { to: '/features', label: 'See all features' },
  },
  {
    image: 'home-meetup',
    label: 'Meet and deal',
    title: 'See it, test it, then pay',
    titleNe: 'हेर्नुहोस्, जाँच्नुहोस्, अनि मात्र तिर्नुहोस्',
    text: 'Pick a busy public place, check the item in person and pay the way you both agree. No courier, no waiting for days.',
    points: [
      { icon: FactCheckRounded, text: 'Inspect before you pay', ne: 'तिर्नुअघि सामान जाँच्नुहोस्' },
      { icon: PaymentsRounded, text: 'Cash, eSewa, Khalti or bank transfer', ne: 'नगद, eSewa, Khalti वा बैंक ट्रान्सफर', tone: 'blue' },
      { icon: StarRateRounded, text: 'Review verified shops after the deal', ne: 'कारोबारपछि पसलको समीक्षा', tone: 'amber' },
    ],
    cta: { to: '/safety', label: 'Meetup safety tips' },
  },
];

export function HomeStory() {
  return (
    <section className="section home-story">
      <div className="container">
        <SectionHeader
          label="How KinBech works"
          title="Sell quick. Buy local."
          titleNe="छिटो बेच्नुहोस्, नजिकै किन्नुहोस्।"
          neFirst
          subtitle="A marketplace built around meeting people in your own city, from the first search to the handshake."
          align="center"
        />
        <div className="home-story-rows">
          {STORY.map((row, index) => (
            <MediaRow key={row.image} {...row} reverse={index % 2 === 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeSellerBand() {
  return (
    <section className="section home-band-section">
      <div className="container">
        <Reveal className="home-band" variant="scale">
          <div className="home-band-copy">
            <span className="section-label">For sellers</span>
            <h2 className="ne-heading" lang="ne">एउटा सामान बेच्नुहोस् वा पूरै पसल चलाउनुहोस्</h2>
            <p className="en-title">Sell one item or run a whole shop</p>
            <p>
              Post a used phone in under a minute as an individual, or open a shop page with your logo,
              opening hours and catalog. Switch anytime from your profile.
            </p>
            <div className="home-band-pills">
              <span><IconUser width={16} height={16} /> Individual</span>
              <span><IconShop width={16} height={16} /> Shop owner</span>
              <span><IconShield width={16} height={16} /> Verified badge</span>
            </div>
            <div className="home-band-actions">
              <Link to="/sellers" className="btn btn-primary">How selling works</Link>
              <Link to="/categories" className="btn btn-outline">Browse categories</Link>
            </div>
          </div>
          <SiteImage name="home-sellers" className="home-band-art" />
        </Reveal>
      </div>
    </section>
  );
}

export function HomeDownloadBand() {
  return (
    <section className="section home-download-section">
      <div className="container">
        <Reveal className="home-download" variant="scale">
          <div className="home-download-copy">
            <span className="section-label">Get the app</span>
            <h2>Your local market, in your pocket</h2>
            <p className="ne-title ne-title--slab" lang="ne">नजिकको बजार, तपाईंको फोनमा</p>
            <p>
              Chat, voice calls, posting, saved items and daily updates in one Android app.
              Sign in with your Google account in one tap.
            </p>
            <div className="hero-actions">
              <GooglePlayBadge />
              <Link to="/download" className="btn btn-ghost">More about the app</Link>
            </div>
          </div>
          <SiteImage name="home-download" className="home-download-art" />
        </Reveal>
      </div>
    </section>
  );
}
