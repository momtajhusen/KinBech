import { useSyncExternalStore } from 'react';

// Listing prices are stored in NPR. INR is pegged at 1.6 by Nepal Rastra Bank; the USD rate is a
// fixed estimate, so anything not in NPR is shown with "≈".
const CURRENCIES = {
  NPR: { symbol: 'Rs ', nprPerUnit: 1, locale: 'en-IN' },
  INR: { symbol: '₹', nprPerUnit: 1.6, locale: 'en-IN' },
  USD: { symbol: '$', nprPerUnit: 140, locale: 'en-US' },
};

let current = 'NPR';
const listeners = new Set();

/** Accepts the saved preference ("INR (₹)") or a bare code ("INR"). */
export function currencyCode(preference) {
  const code = String(preference || '').trim().slice(0, 3).toUpperCase();
  return CURRENCIES[code] ? code : 'NPR';
}

export function setDisplayCurrency(preference) {
  const next = currencyCode(preference);
  if (next === current) return;
  current = next;
  listeners.forEach((fn) => fn());
}

export function getDisplayCurrency() {
  return current;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-renders the caller when the buyer switches currency. */
export function useDisplayCurrency() {
  return useSyncExternalStore(subscribe, getDisplayCurrency);
}

export function currencySymbol() {
  return CURRENCIES[current].symbol;
}

export function convertFromNpr(amount) {
  return (Number(amount) || 0) / CURRENCIES[current].nprPerUnit;
}

/** `approx: false` drops the "≈" (e.g. the second half of a price range). */
export function formatMoney(nprAmount, { approx = true } = {}) {
  const { symbol, locale } = CURRENCIES[current];
  const value = convertFromNpr(nprAmount);
  const digits = current !== 'NPR' && value > 0 && value < 10 ? 2 : 0;
  const text = value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${approx && current !== 'NPR' ? '≈ ' : ''}${symbol}${text}`;
}

/** Always NPR — for text that leaves the app (shares) or prices typed by sellers. */
export function formatNpr(nprAmount) {
  return `Rs ${(Number(nprAmount) || 0).toLocaleString('en-IN')}`;
}
