import { useCallback, useRef, useState } from 'react';
import { api } from '../services/api';
import { analysedPhotoKey } from './useListingAiFill';

/**
 * Before publishing: the seller's own recent listing this post repeats (same item posted again).
 * The server compares the already analysed cover, so no photo is sent from here.
 */
export default function useOwnDuplicateCheck() {
  const [duplicate, setDuplicate] = useState(null);
  const [checking, setChecking] = useState(false);
  const runRef = useRef(0);

  const check = useCallback(async ({ title, category, price, photoUri }) => {
    const run = ++runRef.current;
    setDuplicate(null);
    setChecking(true);
    const photoKey = analysedPhotoKey(photoUri);
    const photo = photoKey ? { photoKey } : /\/uploads\//.test(String(photoUri || '')) ? { photoUrl: photoUri } : {};
    const { data } = await api.checkOwnDuplicate({ title, category, price, ...photo });
    if (run !== runRef.current) return;
    setChecking(false);
    setDuplicate(data?.duplicate || null);
  }, []);

  const show = useCallback((listing) => {
    runRef.current += 1;
    setChecking(false);
    setDuplicate(listing || null);
  }, []);

  return { duplicate, checking, check, show };
}
