import { useCallback, useEffect, useRef, useState } from 'react';
import { missingDetails, readDetails, writeDetails } from '../utils/listingDetails';

/**
 * The item details step after AI fills the form: open only after the unsure-photo check and while some
 * detail is missing (or when reopened to change them). Values start from the description (else what AI
 * read) and change by tap or voice. `onClosed()` runs after save or skip.
 */
export function useListingDetailsStep({ ai, description, setDescription, onClosed, photoUri }) {
  const offer = ai.detailsOffer && !ai.pending ? ai.detailsOffer : null;
  const wanted = Boolean(
    offer && (offer.forced || missingDetails(offer.details, readDetails(offer.details, description)))
  );
  const [entry, setEntry] = useState({ offer: null, values: {} });
  const open = wanted && entry.offer === offer;
  const openRef = useRef(false);
  openRef.current = wanted;
  const queuedRef = useRef(null);

  const { closeDetails, reopenDetails } = ai;
  useEffect(() => {
    if (offer && !wanted) closeDetails();
  }, [offer, wanted, closeDetails]);

  // Fresh values each time the card opens; values said while it was closed go on top.
  useEffect(() => {
    if (!wanted || entry.offer === offer) return;
    const queued = queuedRef.current;
    queuedRef.current = null;
    setEntry({ offer, values: { ...readDetails(offer.details, description), ...(queued || {}) } });
  }, [wanted, offer, entry.offer, description]);

  const patch = useCallback((next) => setEntry((current) => ({ ...current, values: { ...current.values, ...next } })), []);
  const setValue = useCallback((key, value) => patch({ [key]: value }), [patch]);

  const finish = (save, extra) => {
    const values = { ...entry.values, ...(extra || {}) };
    if (save && offer && missingDetails(offer.details, values) < offer.details.fields.length) {
      setDescription((current) => writeDetails(current, offer.details, values));
    }
    openRef.current = false;
    closeDetails();
    onClosed?.();
  };

  const known = ai.lastDetails && ai.lastDetails.photoUri === photoUri ? ai.lastDetails.details : null;

  return {
    open,
    openRef,
    details: open ? offer.details : null,
    /** The item's detail fields for this cover photo, open or not. */
    known,
    values: entry.values,
    setValue,
    patch,
    /** Opens the card (again) with `values` filled in, as if the seller tapped and typed them. */
    edit: (values) => {
      if (open) {
        if (values) patch(values);
        return;
      }
      if (!known) return;
      queuedRef.current = values || null;
      reopenDetails();
    },
    /** `extra` values are added first (said in the same voice turn that saves). */
    save: (extra) => finish(true, extra),
    skip: () => finish(false),
  };
}
