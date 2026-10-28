import { Link } from 'react-router-dom';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ChildCareRounded from '@mui/icons-material/ChildCareRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import PersonRemoveRounded from '@mui/icons-material/PersonRemoveRounded';
import PhonelinkSetupRounded from '@mui/icons-material/PhonelinkSetupRounded';
import PrivacyTipRounded from '@mui/icons-material/PrivacyTipRounded';
import CurrencyExchangeRounded from '@mui/icons-material/CurrencyExchangeRounded';
import { LEGAL_COMPANY, LEGAL_LAST_UPDATED, LEGAL_LINKS } from '../content/legalContent';
import Footer from '../components/Footer';
import { PageHero } from '../components/PageShell';

const DOC_ICONS = {
  privacy: { icon: PrivacyTipRounded, tone: 'green', ne: 'गोपनीयता नीति' },
  terms: { icon: GavelRounded, tone: 'blue', ne: 'नियम र सर्तहरू' },
  permissions: { icon: PhonelinkSetupRounded, tone: 'violet', ne: 'एप अनुमति र डाटा प्रयोग' },
  community: { icon: GroupsRounded, tone: 'amber', ne: 'समुदायका दिशानिर्देश' },
  accountDeletion: { icon: PersonRemoveRounded, tone: 'rose', ne: 'खाता मेटाउने नीति' },
  refund: { icon: CurrencyExchangeRounded, tone: 'green', ne: 'फिर्ता र रद्द नीति' },
  childSafety: { icon: ChildCareRounded, tone: 'blue', ne: 'बाल सुरक्षा मापदण्ड' },
};

export default function LegalHubPage() {
  return (
    <div className="inner-page">
      <PageHero
        label="Legal"
        title="Legal & Policies"
        titleNe="कानुनी नीति र नियमहरू"
        subtitle="Privacy, permissions, terms, and account deletion — required for Google Play and user transparency."
        image="legal-hero"
        trail={[{ label: 'Legal & Policies' }]}
        highlights={['Privacy', 'Terms of use', 'Account deletion']}
      />

      <main className="container page-body">
        <div className="legal-hub-grid">
          {LEGAL_LINKS.map((item) => {
            const { icon: Icon, tone, ne } = DOC_ICONS[item.key] || { icon: DescriptionRounded, tone: 'green' };
            return (
              <Link key={item.key} to={`/legal/${item.key}`} className={`legal-hub-card icon-tone--${tone}`}>
                <span className="icon-tile icon-tile--lg">
                  <Icon aria-hidden />
                </span>
                <h2>{item.label}</h2>
                {ne ? <p className="ne-sub ne-sub--card" lang="ne">{ne}</p> : null}
                <p>{item.subtitle}</p>
                <span className="legal-hub-arrow">
                  Read document <ArrowForwardRounded aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>

        <p className="legal-hub-meta">
          {LEGAL_COMPANY.name} · {LEGAL_COMPANY.address}
          <br />
          {LEGAL_COMPANY.supportEmail} · {LEGAL_COMPANY.privacyEmail}
          <br />
          Last updated: {LEGAL_LAST_UPDATED}
        </p>
      </main>

      <Footer />
    </div>
  );
}
