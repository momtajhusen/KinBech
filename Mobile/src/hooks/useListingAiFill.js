import { useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../services/api';
import { showErrorAlert } from '../components/AlertModal';
import { mergeSearchWords } from '../components/SearchWordsField';
import { upsertCategoryMemory } from '../utils/categories';

export const AI_LIMIT_MESSAGE = "Today's AI limit is used up. Please fill the details yourself.";

/** Individual sellers sell used items: suggested price is this share of the brand-new price. */
export const USED_PRICE_SHARE = { Good: 0.5, Fair: 0.25 };

function roundPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n < 1000 ? 50 : n < 10000 ? 100 : n < 100000 ? 500 : 1000;
  return Math.max(step, Math.round(n / step) * step);
}

const ISSUE_LABELS = {
  nudity: 'nudity or adult content',
  violence: 'violence',
  weapon: 'a weapon',
  drugs: 'drugs',
};

/**
 * Gemini reads a product photo and fills the listing details, including an NPR price
 * and the condition. `fields` holds the form setters; `conditions` lists the allowed values.
 * An unsafe photo is kept as `imageFlag` (the listing then goes to manual review);
 * `onRemoveFlaggedPhoto` runs only if the user chooses to remove it.
 */
export function useListingAiFill({
  categories,
  conditions,
  fields,
  forShop = false,
  onTitleFilled,
  onRemoveFlaggedPhoto,
  setAlertConfig,
}) {
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const [aiPrice, setAiPrice] = useState(null);
  const [aiCondition, setAiCondition] = useState(null);
  const [aiNewPrice, setAiNewPrice] = useState(null);
  const [imageFlag, setImageFlag] = useState(null);

  const showAlert = (title, message) =>
    setAlertConfig(
      showErrorAlert({ title, message, onConfirm: () => setAlertConfig(null) })
    );

  /** Resolves to 'done', 'blocked', 'failed' or 'skipped'. */
  const fill = async ({ photoUri, silent = false, onlyEmpty = false } = {}) => {
    if (filling) return 'skipped';
    if (!photoUri) {
      if (!silent) showAlert('Add a photo first', 'AI needs a product photo to read the details from.');
      return 'skipped';
    }
    setFilling(true);
    setError('');
    try {
      // Shrink before sending — a smaller photo comes back much faster.
      const prepared = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 640 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!prepared?.base64) throw new Error('Could not read that photo');

      const { data, error: apiError } = await api.suggestListingDetails({
        image: prepared.base64,
        mimeType: 'image/jpeg',
        categories: categories.map((cat) => cat.label),
        ...(forShop ? { forShop: true } : {}),
      });
      const suggestion = data?.suggestion;
      if (apiError || !suggestion) throw new Error(apiError || 'AI could not read that photo');

      if (suggestion.imageBlocked) {
        setAiPrice(null);
        setAiCondition(null);
        setAiNewPrice(null);
        const issue = ISSUE_LABELS[suggestion.blockIssue] ? suggestion.blockIssue : 'other';
        setImageFlag({ uri: photoUri, issue, reason: suggestion.blockReason || '' });
        const label = ISSUE_LABELS[issue] || 'content that breaks KinBech rules';
        setAlertConfig({
          type: 'warning',
          title: 'Photo needs review',
          message: `This photo may show ${label}.${suggestion.blockReason ? `\nReason: ${suggestion.blockReason}` : ''}\n\nIf you keep it, your listing will go to manual review and will go live only after our team approves it.`,
          primaryButton: { text: 'Keep photo', onPress: () => setAlertConfig(null) },
          secondaryButton: {
            text: 'Remove photo',
            onPress: () => {
              setAlertConfig(null);
              setImageFlag(null);
              onRemoveFlaggedPhoto?.(photoUri);
            },
          },
        });
        return 'blocked';
      }
      setImageFlag((current) => (current?.uri === photoUri ? null : current));

      // An automatic fill must not overwrite what the user already typed.
      const put = (setter, text) => {
        if (!text || !setter) return;
        setter((current) => (onlyEmpty && String(current || '').trim() ? current : text));
      };
      put(fields.setTitle, suggestion.title);
      put(fields.setDescription, suggestion.description);
      if (suggestion.title) onTitleFilled?.();
      if (Array.isArray(suggestion.searchWords) && suggestion.searchWords.length) {
        fields.setSearchWords?.((current) => mergeSearchWords(current, suggestion.searchWords));
      }
      if (suggestion.category) {
        const record = suggestion.categoryRecord;
        const item = {
          id: record?.id,
          label: suggestion.category,
          icon: record?.icon || 'pricetag-outline',
          color: record?.color || '#5B39C6',
          tint: record?.color || '#5B39C6',
        };
        upsertCategoryMemory('product', item);
        fields.setCategory?.(suggestion.category, item);
      }
      if (suggestion.condition && conditions.includes(suggestion.condition)) {
        fields.setCondition?.(suggestion.condition);
        setAiCondition(suggestion.condition);
      }
      const newPrice = Number(suggestion.newPrice);
      setAiNewPrice(!forShop && suggestion.priceSource === 'new_price' && newPrice > 0 ? newPrice : null);
      const price = Number(suggestion.price);
      if (Number.isFinite(price) && price > 0) {
        setAiPrice(price);
        put(fields.setPrice, String(price));
      }
      return 'done';
    } catch (err) {
      const message = String(err?.message || '');
      if (/limit|quota|turned off/i.test(message)) {
        const text = /turned off/i.test(message) ? message : AI_LIMIT_MESSAGE;
        setLimitReached(true);
        setError(text);
        if (!silent) showAlert('AI not available', text);
        return 'failed';
      }
      // An automatic fill must never interrupt with a dialog.
      if (silent) setError('AI could not read the photo. Tap the sparkle icon to retry.');
      else showAlert('AI fill failed', message || 'Could not analyse the photo. Please try again.');
      return 'failed';
    } finally {
      setFilling(false);
    }
  };

  /** New AI price for a condition, from the brand-new price; null when there is none. */
  const reprice = (condition) => {
    const share = USED_PRICE_SHARE[condition];
    if (!aiNewPrice || !share) return null;
    const next = roundPrice(aiNewPrice * share);
    setAiPrice(next);
    return next;
  };

  return { fill, filling, error, limitReached, aiPrice, aiCondition, aiNewPrice, reprice, imageFlag };
}

/** Short English warning when a price is 0 or far from the AI/market estimate. */
export function priceWarning(price, estimate) {
  const text = String(price ?? '').trim();
  if (!text) return '';
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(value)) return '';
  if (value <= 0) return 'Price is NPR 0. This listing will go to manual review.';
  if (!(estimate > 0)) return '';
  const ratio = value / estimate;
  if (ratio < 0.3) return 'Price looks too low for this item. It will go to manual review.';
  if (ratio > 3) return 'Price looks too high for this item. It will go to manual review.';
  return '';
}
