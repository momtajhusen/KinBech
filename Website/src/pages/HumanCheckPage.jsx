import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import Turnstile from '../components/Turnstile';
import { apiUrl } from '../config';

/** Opened from the app when sign-in looks risky; marks the app's ticket as human-verified. */
export default function HumanCheckPage() {
  const [params] = useSearchParams();
  const ticket = params.get('ticket') || '';
  const [siteKey, setSiteKey] = useState('');
  const [status, setStatus] = useState(ticket ? 'loading' : 'missing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!ticket) return;
    fetch(apiUrl('/auth/captcha/config'))
      .then((res) => res.json())
      .then((data) => {
        if (data.enabled && data.siteKey) {
          setSiteKey(data.siteKey);
          setStatus('ready');
        } else {
          setStatus('done');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Could not reach KinBech. Check your internet and reload this page.');
      });
  }, [ticket]);

  const submit = async (token) => {
    if (!token) return;
    setStatus('checking');
    try {
      const res = await fetch(apiUrl('/auth/captcha/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.verified) {
        setStatus('done');
        return;
      }
      setStatus('error');
      setMessage(data.message || 'Verification failed. Please try again.');
    } catch {
      setStatus('error');
      setMessage('Could not reach KinBech. Check your internet and try again.');
    }
  };

  return (
    <PageShell label="Security" title="Quick human check" titleNe="तपाईं रोबोट होइन भनी छोटो जाँच" subtitle="This keeps bots away from KinBech sign-in." image="security-hero">
      <div className="container">
        <section className="page-info-card human-check">
          {status === 'missing' && <p>This link is incomplete. Go back to the KinBech app and try again.</p>}
          {status === 'loading' && <p>Loading…</p>}
          {status === 'ready' && (
            <>
              <p>Tick the box below to continue.</p>
              <Turnstile siteKey={siteKey} onToken={submit} onError={(msg) => { setStatus('error'); setMessage(msg); }} />
            </>
          )}
          {status === 'checking' && <p>Checking…</p>}
          {status === 'done' && (
            <>
              <h3>All done ✓</h3>
              <p>Go back to the KinBech app — it will continue automatically.</p>
            </>
          )}
          {status === 'error' && (
            <>
              <p>{message}</p>
              <button type="button" className="btn btn-outline page-cta-btn" onClick={() => window.location.reload()}>
                Try again
              </button>
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
