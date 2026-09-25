import { API_BASE } from '../config';

/**
 * Report client crashes/bugs to Backend Error Log (and Sentry via server).
 */

export async function reportClientError(payload = {}, { token } = {}) {
  const base = String(API_BASE || '').replace(/\/$/, '');
  if (!base) return { ok: false };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    await fetch(`${base}/errors`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: payload.source || 'website',
        message: payload.message || 'Unknown client error',
        stack: payload.stack || '',
        name: payload.name || 'Error',
        severity: payload.severity || 'error',
        path: payload.path || (typeof window !== 'undefined' ? window.location.pathname : ''),
        route: payload.route || '',
        url: payload.url || (typeof window !== 'undefined' ? window.location.href : ''),
        platform: payload.platform || (typeof navigator !== 'undefined' ? navigator.platform : ''),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        appVersion: payload.appVersion || '',
        extra: payload.extra || {},
        breadcrumbs: payload.breadcrumbs || [],
      }),
      keepalive: true,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function installWindowErrorHandlers({ source = 'website', token } = {}) {
  if (typeof window === 'undefined') return () => {};

  const onError = (event) => {
    reportClientError(
      {
        source,
        message: event?.message || event?.error?.message || 'window.onerror',
        stack: event?.error?.stack || '',
        name: event?.error?.name || 'Error',
        severity: 'error',
        extra: { filename: event?.filename, lineno: event?.lineno, colno: event?.colno },
      },
      { token }
    );
  };

  const onRejection = (event) => {
    const reason = event?.reason;
    reportClientError(
      {
        source,
        message: reason?.message || String(reason || 'Unhandled rejection'),
        stack: reason?.stack || '',
        name: reason?.name || 'UnhandledRejection',
        severity: 'error',
      },
      { token }
    );
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
