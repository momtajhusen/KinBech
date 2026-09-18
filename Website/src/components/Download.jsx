import SectionHeader from './SectionHeader';
import Reveal from './Reveal';
import { IconMobile, IconPhone } from './Icons';

export default function Download({ embedded = false }) {
  const box = (
        <Reveal as="div" className="download-box" variant="scale" delay={100}>
          <div className="download-visual">
            <div className="download-phone">
              <IconMobile width={40} height={40} />
            </div>
            <div className="download-features">
              <div className="download-feature">
                <IconPhone width={18} height={18} />
                <span>+977 phone login</span>
              </div>
              <div className="download-feature">
                <span className="download-dot" />
                <span>Free to browse &amp; list</span>
              </div>
              <div className="download-feature">
                <span className="download-dot" />
                <span>Works across Nepal</span>
              </div>
            </div>
          </div>
          <p className="download-text">
            KinBech is coming soon to the App Store and Google Play. Browse listings on the web
            today, or check back here for download links when we launch.
          </p>
          <div className="store-badges">
            <div className="store-badge" title="Coming soon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden>
                <path d="M18.7 12.1c-.1-2.1 1.7-3.1 1.8-3.2-1-.1-2-.6-2.6-1.5-.6-.9-.7-2-.2-3-.9.5-2 .4-2.7-.2-.7-.6-1-1.6-.7-2.5 1-.4 2.2.1 2.8 1 .6-2.4 3.4-3.6 5.6-2.7 1-.7 1.7-1.8 2.9-1.8 1.2 0 1.9.9 2.9.9 1.2 0 2-1.1 3.4-.9.6.1 2.2.6 3.2 2.3-.1.1-1.9 1.1-1.9 3.3 0 2.6 2.3 3.5 2.3 3.5-.1.2-.4.8-.4 1.6 0 1.3 1.1 2.3 2.4 2.3.7 0 1.3-.3 1.7-.7-.1 2.2-2 3.1-2.1 3.1-.5.3-1.2.5-1.9.5-1.4 0-2.5-.9-3.5-.9-1 0-2 .9-3.3.9-.7 0-1.4-.2-2-.5z" />
              </svg>
              <span>
                <small>Download on the</small>
                <strong>App Store</strong>
              </span>
            </div>
            <div className="store-badge" title="Coming soon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden>
                <path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.08L13.69 12 3.84 21.92c-.5-.31-.84-.83-.84-1.42zM16.81 15.12 6.05 21.34l8.49-8.49 2.27 2.27zm3.35-2.89-2.04-1.14 2.61-2.61 1.36 1.36c.39.39.39 1.02 0 1.41l-1.93 1.98zM6.05 2.66l10.76 6.22-2.27 2.27L6.05 2.66z" />
              </svg>
              <span>
                <small>Get it on</small>
                <strong>Google Play</strong>
              </span>
            </div>
          </div>
          <p className="beta-note">
            Questions before launch? Email{' '}
            <a href="mailto:support@kinbech.com">support@kinbech.com</a>
          </p>
        </Reveal>
  );

  if (embedded) {
    return <section className="section section-embedded download-section"><div className="container">{box}</div></section>;
  }

  return (
    <section className="section download-section" id="download">
      <div className="container">
        <SectionHeader
          label="Get started"
          title="Download KinBech"
          subtitle="Get the KinBech app on iPhone and Android — launching soon on the App Store and Google Play."
          align="center"
        />
        {box}
      </div>
    </section>
  );
}
