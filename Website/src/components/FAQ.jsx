import { useState } from 'react';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import GppGoodRounded from '@mui/icons-material/GppGoodRounded';
import LocationCityRounded from '@mui/icons-material/LocationCityRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import SellRounded from '@mui/icons-material/SellRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import SectionHeader from './SectionHeader';
import Reveal from './Reveal';

const FAQS = [
  {
    icon: SellRounded,
    tone: 'green',
    q: 'Is KinBech free to use?',
    qNe: 'के KinBech प्रयोग गर्न निःशुल्क छ?',
    a: 'Yes. Creating an account, browsing listings, and posting items is free. We may introduce optional paid features for shops in the future.',
  },
  {
    icon: PaymentsRounded,
    tone: 'blue',
    q: 'How do payments work?',
    qNe: 'भुक्तानी कसरी हुन्छ?',
    a: 'KinBech does not process payments between users today. You agree on cash, eSewa, Khalti, or bank transfer when you meet. Always inspect the item before paying.',
  },
  {
    icon: LocationCityRounded,
    tone: 'violet',
    q: 'Which cities are supported?',
    qNe: 'कुन-कुन सहरमा चल्छ?',
    a: 'KinBech works anywhere in Nepal. We are focusing launch density in Kathmandu Valley first, then expanding to Pokhara, Biratnagar, and other cities.',
  },
  {
    icon: StorefrontRounded,
    tone: 'amber',
    q: 'Individual vs shop seller — what is the difference?',
    qNe: 'व्यक्तिगत र पसल बिक्रेतामा के फरक छ?',
    a: 'Individuals sell personal items with a simple profile. Shop sellers get a business page with logo, hours, categories, reviews, and optional verification.',
  },
  {
    icon: GppGoodRounded,
    tone: 'rose',
    q: 'How do I stay safe from scams?',
    qNe: 'ठगीबाट कसरी जोगिने?',
    a: 'Meet in public, never pay full amount before seeing the item, keep conversation in-app, and report suspicious listings. KinBech will never ask for your OTP or bank PIN.',
  },
  {
    icon: SupportAgentRounded,
    tone: 'blue',
    q: 'How can I contact support?',
    qNe: 'सहयोगका लागि कसरी सम्पर्क गर्ने?',
    a: 'Use Help & Support inside the app to submit a ticket, or email support@kinbech.com.',
  },
];

export default function FAQ({ embedded = false }) {
  const [open, setOpen] = useState(0);

  const list = (
        <div className="faq-list">
          {FAQS.map(({ icon: Icon, tone, q, qNe, a }, i) => (
            <Reveal key={q} as="div" className={`faq-item ${open === i ? 'open' : ''}`} delay={i * 60} variant="up">
              <button
                type="button"
                className="faq-q"
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? -1 : i)}
              >
                <span className={`icon-tile icon-tone--${tone}`}>
                  <Icon aria-hidden />
                </span>
                <span className="faq-q-text">
                  {q}
                  <small className="ne-sub" lang="ne">{qNe}</small>
                </span>
                <span className="faq-toggle">
                  <ExpandMoreRounded aria-hidden />
                </span>
              </button>
              <div className="faq-a">
                <p>{a}</p>
              </div>
            </Reveal>
          ))}
        </div>
  );

  if (embedded) {
    return <section className="section section-embedded"><div className="container">{list}</div></section>;
  }

  return (
    <section className="section" id="faq">
      <div className="container">
        <SectionHeader
          label="FAQ"
          title="Common questions"
          subtitle="Everything you need to know before downloading KinBech."
          align="center"
        />
        {list}
      </div>
    </section>
  );
}
