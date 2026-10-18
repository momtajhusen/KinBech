import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import ScreenLoader from '../components/ScreenLoader';
import EmptyState from '../components/EmptyState';
import { api, getAuthToken } from '../services/api';
import { getApiBaseUrlCandidates } from '../config/apiUrl';
import { BRAND_TAGLINE } from '../content/brand';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const POSTER_GRADIENT = ['#064E3B', '#059669'];
const QR_SIZE = 200;
const LOGO = require('../../assets/icons/app-icon.png');

const STEPS = [
  { icon: 'camera-outline', title: 'Open camera' },
  { icon: 'scan-outline', title: 'Scan QR' },
  { icon: 'bag-handle-outline', title: 'Shop & chat' },
];

function safeFileName(name) {
  return (
    String(name || 'shop')
      .trim()
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 48) || 'shop'
  );
}

export default function ShopStorefrontQrScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [storefront, setStorefront] = useState(null);
  const [error, setError] = useState('');

  const loadStorefront = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await api.getMyShopStorefront();
    setLoading(false);
    if (err || !data?.storefront) {
      setError(err || 'Could not load storefront QR');
      setStorefront(null);
      return;
    }
    setStorefront(data.storefront);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStorefront();
    }, [loadStorefront])
  );

  const shareLink = async () => {
    if (!storefront?.url) return;
    try {
      await Share.share({
        message: `Shop at ${storefront.shopName} on KinBech\n${storefront.url}`,
        url: storefront.url,
        title: `${storefront.shopName} on KinBech`,
      });
    } catch {
      /* user dismissed */
    }
  };

  const shareFile = async (uri, mimeType, dialogTitle) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType,
        dialogTitle,
        UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.png',
      });
    } else {
      Alert.alert('Saved', 'File saved to app storage.');
    }
  };

  const downloadFile = async ({ pathSuffix, filename }) => {
    const token = getAuthToken();
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    let lastError = null;
    for (const baseUrl of getApiBaseUrlCandidates()) {
      try {
        const result = await FileSystem.downloadAsync(
          `${baseUrl.replace(/\/+$/, '')}${pathSuffix}`,
          fileUri,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (result.status === 200) return result.uri;
        lastError = new Error(`Server returned ${result.status}`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Could not download file');
  };

  const downloadPdf = async () => {
    if (!storefront || busy) return;
    setBusy('pdf');
    try {
      const uri = await downloadFile({
        pathSuffix: '/shops/mine/storefront/banner.pdf',
        filename: `${safeFileName(storefront.shopName)}-kinbech-poster.pdf`,
      });
      await shareFile(uri, 'application/pdf', 'Print your KinBech store poster');
    } catch (err) {
      Alert.alert('Download failed', err?.message || 'Could not download the poster. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const downloadPng = async () => {
    if (!storefront || busy) return;
    setBusy('png');
    const filename = `${safeFileName(storefront.shopName)}-kinbech-qr.png`;
    try {
      let uri;
      try {
        uri = await downloadFile({ pathSuffix: '/shops/mine/storefront/qr.png', filename });
      } catch (err) {
        if (!storefront.qrDataUrl?.includes(',')) throw err;
        uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, storefront.qrDataUrl.split(',')[1], {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      await shareFile(uri, 'image/png', 'Save your KinBech store QR');
    } catch (err) {
      Alert.alert('Download failed', err?.message || 'Could not save the QR image.');
    } finally {
      setBusy('');
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.navBtn}>
        <Ionicons name="chevron-back" size={20} color={colors.onPrimary} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Store QR poster</Text>
        <Text style={styles.headerSub}>Print & stick at your counter</Text>
      </View>
      {storefront ? (
        <Pressable onPress={shareLink} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="share-social-outline" size={18} color={colors.onPrimary} />
        </Pressable>
      ) : (
        <View style={styles.navBtn} />
      )}
    </View>
  );

  if (loading && !storefront) {
    return <ScreenLoader label="Preparing your shop QR" />;
  }

  if (error || !storefront) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        {header}
        <EmptyState
          compact
          icon="qr-code-outline"
          title="QR not available"
          body={error || 'Create a shop first to get your storefront QR code.'}
          buttonLabel="Go back"
          onButtonPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  const meta = [storefront.category, storefront.location].filter(Boolean).join('  ·  ');

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      {header}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.poster}>
          <LinearGradient colors={POSTER_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.posterHero}>
            <View style={[styles.bubble, styles.bubbleA]} />
            <View style={[styles.bubble, styles.bubbleB]} />
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>
                {storefront.isVerified ? 'VERIFIED STORE' : 'KINBECH STORE'}
              </Text>
            </View>
            <View style={styles.brandBlock}>
              <View style={styles.logoBadge}>
                <Image source={LOGO} style={styles.logoImage} />
              </View>
              <Text style={styles.brandName} numberOfLines={1} adjustsFontSizeToFit>
                KinBech App
              </Text>
              <Text style={styles.brandTagline}>{BRAND_TAGLINE}</Text>
            </View>
            <Text style={styles.headline}>SCAN & SHOP</Text>
            <Text style={styles.heroLine}>View all our items & offers on the KinBech app</Text>
          </LinearGradient>

          <View style={styles.storeCard}>
            {storefront.logo ? (
              <View style={styles.storeLogo}>
                <Image source={{ uri: resolveMediaUrl(storefront.logo) }} style={styles.logoImage} />
              </View>
            ) : (
              <View style={styles.storePill}>
                <Ionicons name="storefront" size={10} color={colors.primary} />
                <Text style={styles.storePillText}>OUR STORE</Text>
              </View>
            )}
            <Text style={styles.shopName} numberOfLines={2}>
              {storefront.shopName}
            </Text>
            {meta ? (
              <Text style={styles.shopMeta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}

            <View style={styles.qrFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {storefront.qrDataUrl ? (
                <Image source={{ uri: storefront.qrDataUrl }} style={styles.qrImage} />
              ) : (
                <QRCode value={storefront.url} size={QR_SIZE} color="#0B1F17" backgroundColor="#FFFFFF" ecl="H" />
              )}
              <View style={styles.qrLogoWrap}>
                <View style={styles.qrLogo}>
                  <Image source={LOGO} style={styles.logoImage} />
                </View>
              </View>
            </View>

            <Text style={styles.scanText}>Scan QR Code with your phone camera</Text>
            <Text style={styles.urlText} numberOfLines={1} selectable>
              {storefront.url.replace(/^https?:\/\//, '')}
            </Text>
          </View>

          <View style={styles.steps}>
            {STEPS.map((step, i) => (
              <View key={step.title} style={styles.step}>
                <View style={styles.stepIcon}>
                  <Ionicons name={step.icon} size={15} color={colors.onPrimary} />
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
              </View>
            ))}
          </View>

          <LinearGradient colors={POSTER_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.posterFooter}>
            <Text style={styles.footerTitle}>Get the KinBech app</Text>
            <Text style={styles.footerSub}>Print on A4 · Laminate · Stick at counter</Text>
          </LinearGradient>
        </View>

        <Pressable
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={downloadPdf}
          disabled={Boolean(busy)}
        >
          {busy === 'pdf' ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="print-outline" size={18} color={colors.onPrimary} />
              <View>
                <Text style={styles.primaryBtnText}>Download A4 poster (PDF)</Text>
                <Text style={styles.primaryBtnSub}>Ready to print for your counter</Text>
              </View>
            </>
          )}
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            style={[styles.secondaryBtn, busy && styles.btnDisabled]}
            onPress={downloadPng}
            disabled={Boolean(busy)}
          >
            {busy === 'png' ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="image-outline" size={16} color={colors.primary} />
                <Text style={styles.secondaryBtnText}>QR image</Text>
              </>
            )}
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={shareLink}>
            <Ionicons name="share-social-outline" size={16} color={colors.primary} />
            <Text style={styles.secondaryBtnText}>Share link</Text>
          </Pressable>
        </View>

        <View style={styles.tips}>
          {[
            ['eye-outline', 'Place at eye level near billing counter'],
            ['shield-checkmark-outline', 'Laminate it so it lasts longer'],
            ['sunny-outline', 'Keep it in a well-lit spot for easy scanning'],
          ].map(([icon, text]) => (
            <View key={text} style={styles.tipRow}>
              <Ionicons name={icon} size={14} color={colors.primary} />
              <Text style={styles.tipText}>{text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const CORNER = 26;

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: colors.gradientStart,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  headerSub: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.8)',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  poster: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  posterHero: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 56,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bubbleA: {
    width: 180,
    height: 180,
    top: -70,
    right: -50,
  },
  bubbleB: {
    width: 110,
    height: 110,
    bottom: -40,
    left: -30,
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: 10,
  },
  logoBadge: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: '#065F46',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    marginTop: 10,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  brandTagline: {
    marginTop: 2,
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#A7F3D0',
  },
  heroPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroPillText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  headline: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 3,
    color: '#FFFFFF',
  },
  heroLine: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#D1FAE5',
  },
  storeCard: {
    marginHorizontal: 14,
    marginTop: -40,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  storePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
  },
  storeLogo: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D1FAE5',
    overflow: 'hidden',
  },
  storePillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#047857',
  },
  shopName: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    color: '#0B1F17',
  },
  shopMeta: {
    marginTop: 3,
    fontSize: 11.5,
    color: '#6B7280',
  },
  qrFrame: {
    marginTop: 16,
    marginBottom: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#059669',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  qrImage: {
    width: QR_SIZE,
    height: QR_SIZE,
  },
  qrLogoWrap: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 13,
    padding: 4,
    backgroundColor: '#FFFFFF',
  },
  qrLogo: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#065F46',
  },
  scanText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  urlText: {
    marginTop: 3,
    fontSize: 10.5,
    color: '#6B7280',
  },
  steps: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
  },
  stepNum: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  stepNumText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#047857',
  },
  stepTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  posterFooter: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  footerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerSub: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 9.5,
    color: '#A7F3D0',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  primaryBtnSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  tips: {
    padding: 12,
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
