import SectionHeader from './SectionHeader';
import Reveal from './Reveal';
import AndroidRounded from '@mui/icons-material/AndroidRounded';
import CallRounded from '@mui/icons-material/CallRounded';
import EmailRounded from '@mui/icons-material/EmailRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import SellRounded from '@mui/icons-material/SellRounded';
import {
  MIN_ANDROID,
  PLAY_QR_SRC,
  PLAY_STORE_URL,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_PHONE_HREF,
} from '../content/brand';

const PERKS = [
  { icon: LoginRounded, text: 'One-tap Google sign-in', ne: 'Google बाट साइन इन', tone: 'blue' },
  { icon: ForumRounded, text: 'Chat, voice notes & calls', ne: 'च्याट, भ्वाइस नोट र कल', tone: 'violet' },
  { icon: SellRounded, text: 'Free posts every day', ne: 'हरेक दिन निःशुल्क पोस्ट', tone: 'amber' },
  { icon: PublicRounded, text: 'Works across Nepal', ne: 'नेपालभरि चल्छ', tone: 'green' },
];

export function GooglePlayBadge({ className = '' }) {
  return (
    <a
      className={`play-badge ${className}`.trim()}
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Get KinBech on Google Play"
    >
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
        <path fill="#00C853" d="M3.6 1.8 13.5 12l3.1-3.1L5 2.2c-.5-.3-1-.4-1.4-.4z" />
        <path fill="#FFC107" d="M16.6 8.9 13.5 12l3.1 3.1 3.6-2.1c.8-.5.8-1.5 0-2l-3.6-2.1z" />
        <path fill="#F44336" d="M3.6 22.2c.4 0 .9-.1 1.4-.4l11.6-6.7-3.1-3.1-9.9 10.2z" />
        <path fill="#2196F3" d="M3.6 1.8c-.4.3-.6.7-.6 1.2v18c0 .5.2 1 .6 1.2L13.5 12 3.6 1.8z" />
      </svg>
      <span>
        <small>Get it on</small>
        <strong>Google Play</strong>
      </span>
    </a>
  );
}

export default function Download({ embedded = false }) {
  const box = (
    <Reveal as="div" className="download-card" variant="scale" delay={100}>
      <div className="download-card-main">
        <div className="download-app">
          <img src="/app-icon.png" alt="" width="76" height="76" className="download-app-icon" />
          <div className="download-app-text">
            <strong>KinBech</strong>
            <span>Buy &amp; sell near you</span>
            <span className="download-app-meta">
              <AndroidRounded aria-hidden /> {MIN_ANDROID}+ · Free
            </span>
          </div>
        </div>

        <ul className="download-perks">
          {PERKS.map(({ icon: Icon, text, ne, tone }) => (
            <li key={text}>
              <span className={`icon-tile icon-tone--${tone}`}><Icon aria-hidden /></span>
              <span>
                {text}
                <small lang="ne">{ne}</small>
              </span>
            </li>
          ))}
        </ul>

        <GooglePlayBadge />
      </div>

      <div className="download-qr" aria-hidden>
        <div className="download-qr-code">
          <img src={PLAY_QR_SRC} alt="" width="150" height="150" />
          <img src="/app-icon.png" alt="" className="download-qr-logo" width="34" height="34" />
        </div>
        <strong>Scan to install</strong>
        <span>Open your phone camera and point it here</span>
      </div>

      <div className="download-help">
        <span>Need help installing?</span>
        <a href={SUPPORT_PHONE_HREF}><CallRounded aria-hidden /> {SUPPORT_PHONE}</a>
        <a href={`mailto:${SUPPORT_EMAIL}`}><EmailRounded aria-hidden /> {SUPPORT_EMAIL}</a>
      </div>
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
          subtitle="The KinBech app for Android, on Google Play."
          align="center"
        />
        {box}
      </div>
    </section>
  );
}
