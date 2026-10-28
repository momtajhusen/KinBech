import AndroidRounded from '@mui/icons-material/AndroidRounded';
import ApiRounded from '@mui/icons-material/ApiRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import LanguageRounded from '@mui/icons-material/LanguageRounded';
import MarkEmailReadRounded from '@mui/icons-material/MarkEmailReadRounded';
import ManageAccountsRounded from '@mui/icons-material/ManageAccountsRounded';
import RadarRounded from '@mui/icons-material/RadarRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import SpeedRounded from '@mui/icons-material/SpeedRounded';
import PageShell from '../components/PageShell';
import IconList, { IconTitle } from '../components/IconList';

const IN_SCOPE = [
  { icon: AndroidRounded, text: 'The KinBech Android app' },
  { icon: LanguageRounded, text: 'kinbech.codersalpha.com (website and admin panel)' },
  { icon: ApiRounded, text: 'kinbechapi.codersalpha.com (API)' },
];

const RULES = [
  { icon: ManageAccountsRounded, text: "Only test with your own accounts. Never access, change, or delete other people's data." },
  { icon: BlockRounded, text: 'No denial-of-service, spam, social engineering, or physical attacks.', tone: 'rose' },
  { icon: SpeedRounded, text: 'Do not run automated scanners that flood the service.', tone: 'amber' },
  { icon: ScheduleRounded, text: 'Give us reasonable time to fix the issue before telling anyone else.' },
];

export default function SecurityPolicyPage() {
  return (
    <PageShell
      label="Security"
      title="Report a security issue"
      titleNe="सुरक्षा समस्या गोप्य रूपमा रिपोर्ट गर्नुहोस्"
      subtitle="Found a bug that puts KinBech users at risk? Tell us privately and we'll fix it fast."
      image="security-hero"
      highlights={['Private disclosure', 'Quick triage', 'User data first']}
    >
      <div className="container">
        <section className="page-info-card">
          <IconTitle icon={MarkEmailReadRounded} ne="कसरी रिपोर्ट गर्ने?">How to report</IconTitle>
          <p>
            Email <a href="mailto:support@kinbech.com?subject=Security%20report">support@kinbech.com</a> with
            the subject "Security report". Include the steps to reproduce, the affected URL or app screen, and
            what an attacker could do. We reply within 3 working days.
          </p>
        </section>
        <section className="page-info-card">
          <IconTitle icon={RadarRounded} tone="blue" ne="कुन-कुन कुरा समेटिन्छ">In scope</IconTitle>
          <IconList items={IN_SCOPE} tone="blue" />
        </section>
        <section className="page-info-card">
          <IconTitle icon={GavelRounded} tone="violet" ne="नियमहरू">Rules</IconTitle>
          <IconList items={RULES} tone="violet" />
        </section>
        <section className="page-info-card">
          <IconTitle icon={EmojiEventsRounded} tone="amber" ne="तपाईंले के पाउनुहुन्छ?">What you get</IconTitle>
          <p>
            Valid reports get a public thank-you (if you want one) and, for serious issues, a reward at our
            discretion. If you follow these rules, we will not take legal action against your research.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
