import PageShell from '../components/PageShell';

export default function SecurityPolicyPage() {
  return (
    <PageShell
      label="Security"
      title="Report a security issue"
      subtitle="Found a bug that puts KinBech users at risk? Tell us privately and we'll fix it fast."
    >
      <div className="container">
        <section className="page-info-card">
          <h3>How to report</h3>
          <p>
            Email <a href="mailto:support@kinbech.com?subject=Security%20report">support@kinbech.com</a> with
            the subject "Security report". Include the steps to reproduce, the affected URL or app screen, and
            what an attacker could do. We reply within 3 working days.
          </p>
        </section>
        <section className="page-info-card">
          <h3>In scope</h3>
          <ul className="page-feature-list">
            <li>The KinBech Android app</li>
            <li>kinbech.codersalpha.com (website and admin panel)</li>
            <li>kinbechapi.codersalpha.com (API)</li>
          </ul>
        </section>
        <section className="page-info-card">
          <h3>Rules</h3>
          <ul className="page-feature-list">
            <li>Only test with your own accounts. Never access, change, or delete other people's data.</li>
            <li>No denial-of-service, spam, social engineering, or physical attacks.</li>
            <li>Do not run automated scanners that flood the service.</li>
            <li>Give us reasonable time to fix the issue before telling anyone else.</li>
          </ul>
        </section>
        <section className="page-info-card">
          <h3>What you get</h3>
          <p>
            Valid reports get a public thank-you (if you want one) and, for serious issues, a reward at our
            discretion. If you follow these rules, we will not take legal action against your research.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
