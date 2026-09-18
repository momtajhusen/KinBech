import SectionHeader from './SectionHeader';
import Reveal from './Reveal';
import { IconHandshake, IconPhone, IconSearch, IconChat } from './Icons';

const STEPS = [
  {
    icon: IconPhone,
    tone: 'emerald',
    title: 'Sign up with phone',
    text: 'Enter your Nepal mobile number (+977). Verify with OTP — no email required.',
    detail: '~30 sec setup',
  },
  {
    icon: IconSearch,
    tone: 'blue',
    title: 'Browse or list',
    text: 'Search nearby items or post your own with photos, price, and location in minutes.',
    detail: 'Up to 8 photos',
  },
  {
    icon: IconChat,
    tone: 'violet',
    title: 'Chat & agree',
    text: 'Talk to the buyer or seller in-app. Agree on price and pick a public meetup spot.',
    detail: 'In-app messaging',
  },
  {
    icon: IconHandshake,
    tone: 'amber',
    title: 'Meet & deal',
    text: 'Inspect the item in person, pay how you agree (cash, eSewa, Khalti), and leave a review.',
    detail: 'Face-to-face only',
  },
];

export default function HowItWorks({ embedded = false }) {
  const flow = (
        <div className="steps-flow">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <Reveal
                key={step.title}
                as="article"
                className={`step-card step-card--${step.tone}`}
                delay={index * 100}
                variant="up"
              >
                <div className="step-card-head">
                  <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="step-icon">
                    <Icon width={22} height={22} />
                  </div>
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <span className="step-detail">{step.detail}</span>
                {index < STEPS.length - 1 ? <span className="step-connector" aria-hidden /> : null}
              </Reveal>
            );
          })}
        </div>
  );

  if (embedded) {
    return <section className="section section-embedded section-steps"><div className="container">{flow}</div></section>;
  }

  return (
    <section className="section section-steps" id="how">
      <div className="container">
        <SectionHeader
          label="How it works"
          title="From download to deal in four steps"
          subtitle="Whether you are clearing out your room or running a small shop, KinBech keeps the process simple and local."
          align="center"
        />
        {flow}
      </div>
    </section>
  );
}
