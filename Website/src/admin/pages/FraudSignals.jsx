import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fingerprint, Info, KeyRound, Smartphone, UserX, Wifi } from 'lucide-react';
import api from '../services/api';
import { adminPath } from '../routes';

const fmtDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

function timeAgo(value) {
  if (!value) return '';
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function UserChip({ user }) {
  if (!user) return null;
  const label = user.name || user.phone || 'No name';
  const content = (
    <>
      <span className="fraud-chip-name">{label}</span>
      {user.phone && user.name ? <span className="fraud-chip-sub">{user.phone}</span> : null}
      {user.status === 'suspended' ? <span className="status-badge suspended">Suspended</span> : null}
    </>
  );
  return user.id && user.name !== 'Deleted user'
    ? <Link className="fraud-chip" to={adminPath(`users/${user.id}`)}>{content}</Link>
    : <span className="fraud-chip">{content}</span>;
}

function Block({ icon: Icon, tone = '', title, subtitle, count, children, empty }) {
  return (
    <section className={`card u360-section fraud-block ${tone}`}>
      <header className="u360-section-head">
        <Icon className="item-icon" aria-hidden />
        <h3>{title}</h3>
        <span className="u360-count">{count}</span>
      </header>
      {subtitle ? <p className="form-hint fraud-sub">{subtitle}</p> : null}
      {count ? children : <div className="u360-empty">{empty}</div>}
    </section>
  );
}

export default function FraudSignals() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/moderation/fraud/signals', { params: { hours } });
      setData(response.data);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load fraud signals');
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <div className="loading">Loading fraud signals...</div>;
  if (error && !data) return <div className="card u360-empty">{error}</div>;

  const t = data.thresholds || {};

  return (
    <div className="fraud-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <p className="form-hint inbox-hint">
            Signals are hints, not proof. Open the account and check listings, reports and chats before acting.
          </p>
        </div>
        <div className="filter-group right">
          <span className="fraud-window-label">OTP window</span>
          <div className="u360-chips">
            {[[24, '24 hours'], [72, '3 days'], [168, '7 days']].map(([value, label]) => (
              <button key={value} type="button" className={`u360-chip ${hours === value ? 'on' : ''}`} onClick={() => setHours(value)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="fraud-grid">
        <Block
          icon={UserX}
          tone="danger"
          title="Suspended users coming back"
          subtitle="A suspended account's phone (same app install) was used again for another account or a new number."
          count={data.evasion.length}
          empty="No ban evasion detected"
        >
          <ul className="u360-list">
            {data.evasion.map((row) => (
              <li key={row.install} className="fraud-row">
                <div className="fraud-row-main">
                  <div className="fraud-line"><span className="fraud-label">Suspended</span>{row.suspended.map((u) => <UserChip key={u.id} user={u} />)}</div>
                  {row.accounts.length ? (
                    <div className="fraud-line"><span className="fraud-label">Other accounts</span>{row.accounts.map((u) => <UserChip key={u.id} user={u} />)}</div>
                  ) : null}
                  {row.newPhones.length ? (
                    <div className="fraud-line">
                      <span className="fraud-label">New numbers</span>
                      {row.newPhones.map((p) => (p.user ? <UserChip key={p.phone} user={{ ...p.user, phone: p.phone }} /> : <span key={p.phone} className="fraud-chip"><span className="fraud-chip-name">{p.phone}</span><span className="fraud-chip-sub">OTP only</span></span>))}
                    </div>
                  ) : null}
                </div>
                <span className="u360-li-sub">Install {row.install} · {timeAgo(row.lastAt)}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          icon={KeyRound}
          tone="warning"
          title="Suspended users trying to sign in"
          subtitle="Correct OTP entered on a suspended account in the last 7 days."
          count={data.blockedLogins.length}
          empty="No blocked sign-ins"
        >
          <ul className="u360-list">
            {data.blockedLogins.map((row) => (
              <li key={row.user.id}>
                <div className="u360-li-main"><UserChip user={row.user} /></div>
                <span className="u360-li-sub">{row.attempts} attempt{row.attempts === 1 ? '' : 's'} · {timeAgo(row.lastAt)}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          icon={Smartphone}
          title="Several accounts on one phone"
          subtitle="Same app install signed in to more than one account. Families sometimes share phones, so look for other signals too."
          count={data.sharedInstalls.length}
          empty="No shared installs yet. This needs the latest app version."
        >
          <ul className="u360-list">
            {data.sharedInstalls.map((row) => (
              <li key={row.install} className="fraud-row">
                <div className="fraud-row-main">
                  <div className="fraud-line">{row.users.map((u) => <UserChip key={u.id} user={u} />)}</div>
                </div>
                <span className="u360-li-sub">{row.count} accounts · {row.devices.join(', ') || 'Unknown device'} · seen {timeAgo(row.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          icon={Fingerprint}
          title="OTP floods per phone"
          subtitle={`Numbers with ${t.otpPhoneSends || 5}+ codes sent or wrong codes entered in the window.`}
          count={data.otpPhones.length}
          empty="No phone is requesting too many codes"
        >
          <div className="table-container fraud-table">
            <table className="data-table">
              <thead><tr><th>Phone</th><th>Account</th><th>Sent</th><th>Wrong</th><th>OK</th><th>IPs</th><th>Last</th></tr></thead>
              <tbody>
                {data.otpPhones.map((row) => (
                  <tr key={row.phone}>
                    <td>{row.phone}</td>
                    <td>{row.user ? <UserChip user={row.user} /> : <span className="u360-li-sub">No account</span>}</td>
                    <td>{row.sent}</td>
                    <td className={row.failed >= (t.otpPhoneSends || 5) ? 'fraud-hot' : ''}>{row.failed}</td>
                    <td>{row.verified}</td>
                    <td>{row.ips}</td>
                    <td title={fmtDateTime(row.lastAt)}>{timeAgo(row.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>

        <Block
          icon={Wifi}
          title="OTP floods per network"
          subtitle={`One IP asking codes for ${t.otpIpPhones || 4}+ different numbers. Mobile carriers share IPs, so treat this as weak.`}
          count={data.otpIps.length}
          empty="No network is requesting codes for many numbers"
        >
          <div className="table-container fraud-table">
            <table className="data-table">
              <thead><tr><th>IP</th><th>Numbers</th><th>Codes sent</th><th>Sample numbers</th><th>Last</th></tr></thead>
              <tbody>
                {data.otpIps.map((row) => (
                  <tr key={row.ip}>
                    <td>{row.ip}</td>
                    <td className="fraud-hot">{row.phones}</td>
                    <td>{row.sent}</td>
                    <td className="u360-li-sub">{row.samplePhones.join(', ')}</td>
                    <td title={fmtDateTime(row.lastAt)}>{timeAgo(row.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      </div>

      <div className="u360-banner info">
        <Info className="item-icon" aria-hidden />
        <div>
          <strong>More linked-account signals</strong>
          <span>
            Same network + phone model and reused listing photos are on <Link to={adminPath('trust')}>Seller Trust → Linked accounts</Link>. Each user's links also show on their User Details page.
          </span>
        </div>
      </div>
    </div>
  );
}
