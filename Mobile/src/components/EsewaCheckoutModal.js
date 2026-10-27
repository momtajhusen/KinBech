import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';

const ESEWA_GREEN = '#60BB46';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Auto-submitting form: eSewa ePay only accepts a browser POST. */
function checkoutHtml({ formUrl, fields }) {
  const inputs = Object.entries(fields || {})
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#555">
<p>Opening eSewa…</p>
<form id="pay" method="POST" action="${escapeHtml(formUrl)}">${inputs}</form>
<script>document.getElementById('pay').submit();</script></body></html>`;
}

function readReturn(url, returnUrl) {
  if (!returnUrl || !String(url).startsWith(returnUrl)) return null;
  const rest = String(url).slice(returnUrl.length);
  const outcome = rest.startsWith('/success') ? 'success' : 'failure';
  const match = rest.match(/[?&]data=([^&#]*)/);
  let data;
  if (match) {
    try {
      data = decodeURIComponent(match[1]);
    } catch (_) {
      data = match[1];
    }
  }
  return { outcome, data };
}

/**
 * Full-screen eSewa checkout. `checkout` is the /subscriptions/esewa/start response.
 * Calls `onReturn({ outcome, data })` when eSewa sends the buyer back, or `onClose()` if they leave.
 */
export default function EsewaCheckoutModal({ checkout, onReturn, onClose }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const doneRef = useRef(false);
  const html = useMemo(() => (checkout ? checkoutHtml(checkout) : ''), [checkout]);
  const sandbox = checkout?.mode === 'sandbox';

  const handleUrl = (url) => {
    if (doneRef.current) return true;
    const result = readReturn(url, checkout?.returnUrl);
    if (!result) return false;
    doneRef.current = true;
    onReturn(result);
    return true;
  };

  return (
    <Modal visible={Boolean(checkout)} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Icon name="close" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <View style={styles.titleRow}>
              <View style={styles.brandDot} />
              <Text style={styles.title}>Pay with eSewa</Text>
              {sandbox ? (
                <View style={styles.testBadge}>
                  <Text style={styles.testBadgeText}>TEST</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.subtitle}>
              Rs {Number(checkout?.amount || 0).toLocaleString('en-IN')} · {checkout?.planName}
            </Text>
          </View>
          <Icon name="lock-closed" size={16} color={colors.textMuted} />
        </View>

        {sandbox ? (
          <View style={styles.testStrip}>
            <Icon name="information-circle-outline" size={15} color={colors.warning} />
            <Text style={styles.testStripText}>
              Test mode: eSewa ID 9806800001, password Nepal@123, code 123456. No real money.
            </Text>
          </View>
        ) : null}

        {checkout ? (
          <WebView
            style={styles.web}
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(request) => !handleUrl(request.url)}
            onNavigationStateChange={(state) => handleUrl(state.url)}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
          />
        ) : null}

        {loading ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator size="large" color={ESEWA_GREEN} />
          </View>
        ) : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <Icon name="shield-checkmark-outline" size={14} color={colors.textMuted} />
          <Text style={styles.footerText}>You pay on eSewa's own page. KinBech never sees your eSewa password.</Text>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  headerCopy: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ESEWA_GREEN },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 1, fontSize: 12, color: colors.textMuted },
  testBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: `${colors.warning}22` },
  testBadgeText: { fontSize: 10, fontWeight: '900', color: colors.warning, letterSpacing: 0.5 },
  testStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: `${colors.warning}14`,
  },
  testStripText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: colors.text },
  web: { flex: 1, backgroundColor: '#FFFFFF' },
  loader: { position: 'absolute', left: 0, right: 0, top: 120, alignItems: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerText: { flex: 1, fontSize: 11, color: colors.textMuted },
});
