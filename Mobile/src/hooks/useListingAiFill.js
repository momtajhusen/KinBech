import { useState } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../services/api';
import { showErrorAlert } from '../components/AlertModal';
import { mergeSearchWords } from '../components/SearchWordsField';

export const AI_LIMIT_MESSAGE = "Today's AI limit is used up. Please fill the details yourself.";

/**
 * Gemini reads a product photo and fills every listing detail except the price.
 * `fields` holds the form setters; `conditions` lists the allowed condition values.
 */
export function useListingAiFill({ categories, conditions, fields, onTitleFilled, setAlertConfig }) {
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState('');
  const [limitReached, setLimitReached] = useState(false);

  const showAlert = (title, message) =>
    setAlertConfig(
      showErrorAlert({ title, message, onConfirm: () => setAlertConfig(null) })
    );

  const fill = async ({ photoUri, silent = false, onlyEmpty = false } = {}) => {
    if (filling) return;
    if (!photoUri) {
      if (!silent) showAlert('Add a photo first', 'AI needs a product photo to read the details from.');
      return;
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
      });
      const suggestion = data?.suggestion;
      if (apiError || !suggestion) throw new Error(apiError || 'AI could not read that photo');

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
      if (suggestion.category && categories.some((cat) => cat.label === suggestion.category)) {
        fields.setCategory?.(suggestion.category);
      }
      if (suggestion.condition && conditions.includes(suggestion.condition)) {
        fields.setCondition?.(suggestion.condition);
      }
    } catch (err) {
      const message = String(err?.message || '');
      if (/limit|quota|turned off/i.test(message)) {
        const text = /turned off/i.test(message) ? message : AI_LIMIT_MESSAGE;
        setLimitReached(true);
        setError(text);
        if (!silent) showAlert('AI not available', text);
        return;
      }
      // An automatic fill must never interrupt with a dialog.
      if (silent) setError('AI could not read the photo. Tap the sparkle icon to retry.');
      else showAlert('AI fill failed', message || 'Could not analyse the photo. Please try again.');
    } finally {
      setFilling(false);
    }
  };

  return { fill, filling, error, limitReached };
}
