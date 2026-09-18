import { useState } from 'react';
import SectionHeader from './SectionHeader';
import Reveal from './Reveal';

const FAQS = [
  {
    q: 'Is KinBech free to use?',
    a: 'Yes. Creating an account, browsing listings, and posting items is free. We may introduce optional paid features for shops in the future.',
  },
  {
    q: 'How do payments work?',
    a: 'KinBech does not process payments between users today. You agree on cash, eSewa, Khalti, or bank transfer when you meet. Always inspect the item before paying.',
  },
  {
    q: 'Which cities are supported?',
    a: 'KinBech works anywhere in Nepal. We are focusing launch density in Kathmandu Valley first, then expanding to Pokhara, Biratnagar, and other cities.',
  },
  {
    q: 'Individual vs shop seller — what is the difference?',
    a: 'Individuals sell personal items with a simple profile. Shop sellers get a business page with logo, hours, categories, reviews, and optional verification.',
  },
  {
    q: 'How do I stay safe from scams?',
    a: 'Meet in public, never pay full amount before seeing the item, keep conversation in-app, and report suspicious listings. KinBech will never ask for your OTP or bank PIN.',
  },
  {
    q: 'How can I contact support?',
    a: 'Use Help & Support inside the app to submit a ticket, or email support@kinbech.com.',
  },
];

export default function FAQ({ embedded = false }) {
  const [open, setOpen] = useState(0);

  const list = (
        <div className="faq-list">
          {FAQS.map((item, i) => (
            <Reveal key={item.q} as="div" className={`faq-item ${open === i ? 'open' : ''}`} delay={i * 60} variant="up">
              <button type="button" className="faq-q" onClick={() => setOpen(open === i ? -1 : i)}>
                {item.q}
                <span>+</span>
              </button>
              <div className="faq-a">
                <p>{item.a}</p>
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
