import { Platform } from 'react-native';

/**
 * Report Mobile crashes/API failures to Backend Error Log.
 */
export async function reportMobileError(payload = {}, { baseUrl, token } = {}) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base) return { ok: false };

  let appVersion = '';
  let device = '';
  try {
    // Optional — present in Expo apps
    // eslint-disable-next-line global-require
    const Constants = require('expo-constants').default;
    appVersion = Constants?.expoConfig?.version || Constants?.nativeAppVersion || '';
    device = Constants?.deviceName || '';
  } catch {
    /* ignore */
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    await fetch(`${base}/errors`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source: 'mobile',
        message: payload.message || 'Unknown mobile error',
        stack: payload.stack || '',
        name: payload.name || 'Error',
        severity: payload.severity || 'error',
        statusCode: payload.statusCode || 0,
        path: payload.path || '',
        route: payload.route || '',
        url: payload.url || '',
        platform: `${Platform.OS} ${Platform.Version}`,
        appVersion,
        device,
        extra: payload.extra || {},
        breadcrumbs: payload.breadcrumbs || [],
      }),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
