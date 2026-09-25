import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { AlertModal, showErrorAlert, showSuccessAlert, showImageSafetyAlert } from '../components/AlertModal';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { uploadMediaUri } from '../utils/mediaUpload';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const DOC_LABELS = [
  { key: 'PAN certificate', icon: 'card-outline' },
  { key: 'VAT certificate', icon: 'receipt-outline' },
  { key: 'Business registration', icon: 'document-text-outline' },
  { key: 'Other', icon: 'attach-outline' },
];

function statusCopy(shop) {
  if (shop?.isVerified || shop?.verificationStatus === 'approved') {
    return {
      label: 'Verified shop',
      detail: 'Your business details were reviewed. The verified badge is visible to buyers.',
      colorKey: 'success',
      icon: 'shield-checkmark',
    };
  }
  if (shop?.verificationStatus === 'pending') {
    return {
      label: 'Under review',
      detail: 'We are reviewing your PAN/VAT and documents. This usually takes 1–2 business days.',
      colorKey: 'warning',
      icon: 'time-outline',
    };
  }
  if (shop?.verificationStatus === 'rejected') {
    return {
      label: 'Needs update',
      detail:
        shop?.verificationNotes ||
        'Verification was not approved. Update your details and resubmit.',
      colorKey: 'danger',
      icon: 'alert-circle-outline',
    };
  }
  return {
    label: 'Not submitted',
    detail:
      'Add your PAN or VAT number (optional) and upload business documents to request a verified badge.',
    colorKey: 'textSecondary',
    icon: 'shield-outline',
  };
}

export default function ShopVerificationScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shop, setShop] = useState(null);
  const [panNumber, setPanNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [documents, setDocuments] = useState([]);
  const [docLabel, setDocLabel] = useState(DOC_LABELS[0].key);
  const [alertConfig, setAlertConfig] = useState(null);

  const loadShop = useCallback(async () => {
    setLoading(true);
    const { data, error } = await api.getMyShop();
    setLoading(false);
    if (error || !data?.shop) {
      setAlertConfig(
        showErrorAlert({
          title: 'No shop found',
          message: error || 'Create a shop first, then add business verification details.',
          onConfirm: () => {
            setAlertConfig(null);
            navigation.replace(ROUTES.CREATE_SHOP);
          },
        })
      );
      return;
    }
    const s = data.shop;
    setShop(s);
    setPanNumber(s.panNumber || '');
    setVatNumber(s.vatNumber || '');
    setDocuments(Array.isArray(s.businessDocuments) ? s.businessDocuments : []);
  }, [navigation]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  const pickDocument = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAlertConfig(
        showErrorAlert({
          title: 'Permission needed',
          message: 'Allow photo library access to upload PAN/VAT or registration photos.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    setSaving(true);
    const uploaded = await uploadMediaUri(result.assets[0].uri, 'shops');
    setSaving(false);
    if (uploaded.error) {
      setAlertConfig(
        uploaded.isSafetyBlock || uploaded.errorCode
          ? showImageSafetyAlert({
              code: uploaded.errorCode,
              message: uploaded.error,
              issues: uploaded.issues,
              onConfirm: () => setAlertConfig(null),
            })
          : showErrorAlert({
              title: 'Upload failed',
              message: uploaded.error,
              onConfirm: () => setAlertConfig(null),
            })
      );
      return;
    }
    setDocuments((prev) => [
      ...prev,
      { url: uploaded.url, label: docLabel, uploadedAt: new Date().toISOString() },
    ]);
  };

  const removeDoc = (index) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const shopId = shop?._id || shop?.id;
    if (!shopId) return;

    setSaving(true);
    const { data, error } = await api.updateShop(shopId, {
      panNumber: panNumber.trim(),
      vatNumber: vatNumber.trim(),
      businessDocuments: documents.map((d) => ({
        url: d.url,
        label: d.label || 'Business document',
      })),
    });
    setSaving(false);

    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not save',
          message: error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }

    if (data?.shop) {
      setShop(data.shop);
      setPanNumber(data.shop.panNumber || '');
      setVatNumber(data.shop.vatNumber || '');
      setDocuments(Array.isArray(data.shop.businessDocuments) ? data.shop.businessDocuments : []);
    }

    setAlertConfig(
      showSuccessAlert({
        title: 'Details saved',
        message:
          data?.shop?.isVerified
            ? 'Your verified shop details were updated.'
            : 'Submitted for review. You will get a verified badge after admin approval.',
        onConfirm: () => setAlertConfig(null),
      })
    );
  };

  const status = statusCopy(shop);
  const statusColor =
    status.colorKey === 'success'
      ? colors.success || colors.primary
      : status.colorKey === 'warning'
        ? colors.warning || '#D97706'
        : status.colorKey === 'danger'
          ? colors.danger
          : colors.textSecondary;

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onGradient} />
          </Pressable>
          <Text style={styles.headerTitle}>Business verification</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.headerSubtitle}>
          PAN/VAT are optional. Verified badge appears after admin review.
        </Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.statusCard, { borderColor: statusColor }]}>
              <View style={[styles.statusIcon, { backgroundColor: `${statusColor}18` }]}>
                <Ionicons name={status.icon} size={22} color={statusColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusLabel, { color: statusColor }]}>{status.label}</Text>
                <Text style={styles.statusDetail}>{status.detail}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Tax IDs (optional)</Text>
            <Text style={styles.sectionHint}>
              Registered businesses in Nepal may need PAN/VAT for tax reporting. Adding them helps
              buyers trust your shop.
            </Text>

            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>PAN number</Text>
              <TextInput
                value={panNumber}
                onChangeText={setPanNumber}
                placeholder="e.g. 123456789"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>VAT number</Text>
              <TextInput
                value={vatNumber}
                onChangeText={setVatNumber}
                placeholder="Optional VAT registration number"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                style={styles.input}
              />
            </View>

            <Text style={styles.sectionTitle}>Documents</Text>
            <Text style={styles.sectionHint}>
              Upload clear photos of your PAN, VAT, or business registration certificate.
            </Text>

            <View style={styles.chipRow}>
              {DOC_LABELS.map((item) => {
                const active = docLabel === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setDocLabel(item.key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={14}
                      color={active ? colors.onPrimary : colors.textSecondary}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.key}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.uploadBtn} onPress={pickDocument} disabled={saving}>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
              <Text style={styles.uploadBtnText}>Upload {docLabel}</Text>
            </Pressable>

            {documents.length ? (
              <View style={styles.docList}>
                {documents.map((doc, index) => (
                  <View key={`${doc.url}-${index}`} style={styles.docRow}>
                    <Image
                      source={{ uri: resolveMediaUrl(doc.url) }}
                      style={styles.docThumb}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docLabel}>{doc.label || 'Document'}</Text>
                      <Text style={styles.docMeta} numberOfLines={1}>
                        {doc.url}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeDoc(index)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyDocs}>No documents uploaded yet.</Text>
            )}

            <GradientButton
              title={saving ? 'Saving…' : 'Save & submit for review'}
              icon="shield-checkmark-outline"
              disabled={saving}
              onPress={handleSave}
              style={styles.submit}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </View>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onGradient,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.onGradient,
    opacity: 0.9,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  statusCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  statusDetail: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
  },
  sectionHint: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  fieldCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.onPrimary },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  docList: { gap: 10 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.iconBackground },
  docLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  docMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  emptyDocs: { fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: 8 },
  submit: { marginTop: 12 },
});
