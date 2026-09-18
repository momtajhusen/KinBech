import { useCallback, useRef, useState } from 'react';
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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import { api, getAuthToken } from '../services/api';
import { getApiBaseUrlCandidates } from '../config/apiUrl';
import EmptyState from '../components/EmptyState';
import { BRAND_TAGLINE } from '../content/brand';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

function safeFileName(name) {
  return String(name || 'shop')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48) || 'shop';
}

export default function ShopStorefrontQrScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const qrRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
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
    }, [loadStorefront]),
  );

  const shareLink = async () => {
    if (!storefront?.url) return;
    try {
      await Share.share({
        message: `Follow ${storefront.shopName} on KinBech\n${storefront.url}`,
        url: storefront.url,
        title: `${storefront.shopName} on KinBech`,
      });
    } catch {
      /* user dismissed */
    }
  };

  const downloadStorefrontFile = async ({ pathSuffix, filename, mimeType, dialogTitle }) => {
    if (!storefront) return;
    try {
      const token = getAuthToken();
      const candidates = getApiBaseUrlCandidates();
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      let downloadedUri = null;
      let lastError = null;

      for (const baseUrl of candidates) {
        try {
          const result = await FileSystem.downloadAsync(
            `${baseUrl.replace(/\/+$/, '')}${pathSuffix}`,
            fileUri,
            {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
          );
          if (result.status === 200) {
            downloadedUri = result.uri;
            break;
          }
          lastError = new Error(`Download failed (${result.status})`);
        } catch (err) {
          lastError = err;
        }
      }

      if (!downloadedUri) {
        throw lastError || new Error('Could not download file');
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadedUri, {
          mimeType,
          dialogTitle,
          UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.png',
        });
      } else {
        Alert.alert('Saved', 'File saved to app cache.');
      }
    } catch (err) {
      Alert.alert('Download failed', err?.message || 'Could not save file');
      throw err;
    }
  };

  const savePrintableQr = async () => {
    if (!storefront || saving || savingPdf) return;
    setSaving(true);
    try {
      await downloadStorefrontFile({
        pathSuffix: '/shops/mine/storefront/qr.png',
        filename: `${safeFileName(storefront.shopName)}-kinbech-qr.png`,
        mimeType: 'image/png',
        dialogTitle: 'Save or print KinBech shop QR',
      });
    } catch (err) {
      if (storefront.qrDataUrl?.includes(',')) {
        const fileUri = `${FileSystem.cacheDirectory}${safeFileName(storefront.shopName)}-kinbech-qr.png`;
        await FileSystem.writeAsStringAsync(fileUri, storefront.qrDataUrl.split(',')[1], {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'image/png',
            dialogTitle: 'Save or print KinBech shop QR',
            UTI: 'public.png',
          });
        }
      } else {
        Alert.alert('Download failed', err?.message || 'Could not save QR code');
      }
    } finally {
      setSaving(false);
    }
  };

  const downloadPdfBanner = async () => {
    if (!storefront || saving || savingPdf) return;
    setSavingPdf(true);
    try {
      await downloadStorefrontFile({
        pathSuffix: '/shops/mine/storefront/banner.pdf',
        filename: `${safeFileName(storefront.shopName)}-kinbech-counter-banner.pdf`,
        mimeType: 'application/pdf',
        dialogTitle: 'Print counter QR banner (PDF)',
      });
    } finally {
      setSavingPdf(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Preparing your shop QR…</Text>
        </View>
      </View>
    );
  }

  if (error || !storefront) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Shop QR Code</Text>
          <View style={styles.navBtn} />
        </View>
        <EmptyState
          icon="qr-code-outline"
          title="QR not available"
          body={error || 'Create a shop first to get your storefront QR code.'}
          buttonLabel="Go back"
          onButtonPress={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Shop QR Code</Text>
        <View style={styles.navBtn} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          Download a printable counter banner for your shop. Customers scan the QR to see all your items and offers on KinBech.
        </Text>

        <View style={styles.bannerCopyCard}>
          <Text style={styles.bannerCopyHindi}>
            Hamare sabhi items aur offers KinBech app par dekhein
          </Text>
          <Text style={styles.bannerCopyCta}>Scan QR Code</Text>
        </View>

        <View style={styles.printCard}>
          <View style={styles.printCardHeader}>
            <Image source={require('../../assets/icons/app-icon.png')} style={styles.brandIcon} />
            <View style={styles.printCardBrand}>
              <Text style={styles.brandName}>KinBech</Text>
              <Text style={styles.brandTagline}>{BRAND_TAGLINE}</Text>
            </View>
          </View>

          <Text style={styles.shopName}>{storefront.shopName}</Text>
          <Text style={styles.scanHint}>Scan to view shop & follow online</Text>

          <View style={styles.qrWrap}>
            {storefront.qrDataUrl ? (
              <Image source={{ uri: storefront.qrDataUrl }} style={styles.qrImage} />
            ) : (
              <QRCode
                getRef={(ref) => {
                  qrRef.current = ref;
                }}
                value={storefront.url}
                size={220}
                color="#0B0F17"
                backgroundColor="#FFFFFF"
              />
            )}
          </View>

          <Text style={styles.urlText} selectable>
            {storefront.url}
          </Text>
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Print tips</Text>
          <Text style={styles.tipItem}>• Place near checkout or entrance at eye level</Text>
          <Text style={styles.tipItem}>• Use A5 or larger for easy scanning</Text>
          <Text style={styles.tipItem}>• Laminate for durability in busy shops</Text>
        </View>

        <Pressable
          style={[styles.primaryBtn, (savingPdf || saving) && styles.primaryBtnDisabled]}
          onPress={downloadPdfBanner}
          disabled={savingPdf || saving}
        >
          {savingPdf ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={18} color={colors.onPrimary} />
              <Text style={styles.primaryBtnText}>Download PDF counter banner</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={[styles.secondaryBtn, (saving || savingPdf) && styles.primaryBtnDisabled]}
          onPress={savePrintableQr}
          disabled={saving || savingPdf}
        >
          {saving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Download QR image (PNG)</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.secondaryBtn} onPress={shareLink}>
          <Ionicons name="share-social-outline" size={18} color={colors.primary} />
          <Text style={styles.secondaryBtnText}>Share shop link</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  bannerCopyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  bannerCopyHindi: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 22,
  },
  bannerCopyCta: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  printCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
  },
  printCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  printCardBrand: {
    flex: 1,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  brandTagline: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  shopName: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  scanHint: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  qrWrap: {
    marginTop: 18,
    marginBottom: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  urlText: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  tipsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  tipItem: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
});
