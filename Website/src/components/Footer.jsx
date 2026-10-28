import { Link } from 'react-router-dom';
import BugReportRounded from '@mui/icons-material/BugReportRounded';
import CallRounded from '@mui/icons-material/CallRounded';
import CategoryRounded from '@mui/icons-material/CategoryRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import EmailRounded from '@mui/icons-material/EmailRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import HandshakeRounded from '@mui/icons-material/HandshakeRounded';
import HealthAndSafetyRounded from '@mui/icons-material/HealthAndSafetyRounded';
import HelpCenterRounded from '@mui/icons-material/HelpCenterRounded';
import LocationOnRounded from '@mui/icons-material/LocationOnRounded';
import PersonRemoveRounded from '@mui/icons-material/PersonRemoveRounded';
import PhoneIphoneRounded from '@mui/icons-material/PhoneIphoneRounded';
import PhonelinkSetupRounded from '@mui/icons-material/PhonelinkSetupRounded';
import PrivacyTipRounded from '@mui/icons-material/PrivacyTipRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StoreRounded from '@mui/icons-material/StoreRounded';
import { BRAND_TAGLINE } from '../content/brand';
import BrandMark from './BrandMark';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { to: '/explore', label: 'Explore', icon: SearchRounded },
      { to: '/categories', label: 'Categories', icon: CategoryRounded },
      { to: '/features', label: 'Features', icon: StarRounded },
      { to: '/how-it-works', label: 'How it works', icon: HandshakeRounded },
      { to: '/sellers', label: 'For sellers', icon: StoreRounded },
      { to: '/download', label: 'Download', icon: PhoneIphoneRounded },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/legal', label: 'All policies', icon: GavelRounded },
      { to: '/legal/privacy', label: 'Privacy Policy', icon: PrivacyTipRounded },
      { to: '/legal/terms', label: 'Terms & Conditions', icon: DescriptionRounded },
      { to: '/legal/permissions', label: 'App permissions', icon: PhonelinkSetupRounded },
      { to: '/legal/accountDeletion', label: 'Account deletion', icon: PersonRemoveRounded },
      { to: '/safety', label: 'Safety tips', icon: HealthAndSafetyRounded },
      { to: '/faq', label: 'FAQ', icon: HelpCenterRounded },
    ],
  },
  {
    title: 'Contact',
    links: [
      { href: 'mailto:support@kinbech.com', label: 'support@kinbech.com', icon: EmailRounded },
      { to: '/security', label: 'Report a security issue', icon: BugReportRounded },
      { label: 'Kathmandu, Nepal', icon: LocationOnRounded },
      { label: '+977 support line — coming soon', icon: CallRounded },
    ],
  },
];

function FooterItem({ to, href, label, icon: Icon }) {
  const content = (
    <>
      <span className="footer-icon"><Icon aria-hidden /></span>
      {label}
    </>
  );
  if (to) return <Link to={to}>{content}</Link>;
  if (href) return <a href={href}>{content}</a>;
  return <span className="footer-text">{content}</span>;
}

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <BrandMark variant="footer" showTagline />
            <p>
              KinBech — {BRAND_TAGLINE}. Nepal&apos;s trusted local marketplace for face-to-face
              deals without shipping hassle.
            </p>
            <p className="footer-ne" lang="ne">नेपालको भरपर्दो स्थानीय बजार — नजिकै किन्नुहोस्, छिटो बेच्नुहोस्।</p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h4>{column.title}</h4>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}><FooterItem {...link} /></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© {year} KinBech. All rights reserved.</span>
          <span>Made for Coders Alpha</span>
        </div>
      </div>
    </footer>
  );
}
