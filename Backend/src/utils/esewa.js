const crypto = require('crypto');
const PaymentGateway = require('../models/PaymentGateway');
const { sealField, openField } = require('./fieldCrypto');

/** eSewa ePay v2: https://developer.esewa.com.np/pages/Epay */
const URLS = {
  sandbox: {
    form: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://rc.esewa.com.np/api/epay/transaction/status/',
  },
  live: {
    form: 'https://epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://esewa.com.np/api/epay/transaction/status/',
  },
};

/** Public UAT credentials from eSewa's developer docs (test money only). */
const SANDBOX_CREDENTIALS = { productCode: 'EPAYTEST', secretKey: '8gBm/:&EnhH.1/q' };

/** eSewa Intent: https://developer.esewa.com.np/pages/Intent — the buyer pays inside the eSewa app. */
const INTENT_BASE = {
  sandbox: 'https://rc-checkout.esewa.com.np/api/client/intent/payment',
  live: 'https://checkout.esewa.com.np/api/client/intent/payment',
};
const INTENT_SANDBOX_CREDENTIALS = { productCode: 'INTENT', secretKey: 'LB0REg8HUSw3MTYrI1s6JTE8Kyc6JyAqJiA3MQ==' };
const INTENT_BOOK_FIELDS = 'product_code,amount,transaction_uuid';
const INTENT_STATUS_FIELDS = 'booking_id,product_code,correlation_id';
const INTENT_CANCEL_FIELDS = 'booking_id,product_code';

const REQUEST_SIGNED_FIELDS = 'total_amount,transaction_uuid,product_code';
const STATUS_TIMEOUT_MS = 15000;
const CACHE_MS = 30 * 1000;

let cache = null;
let cacheAt = 0;

function sign(message, secretKey) {
  return crypto.createHmac('sha256', String(secretKey)).update(String(message)).digest('base64');
}

function signFields(fields, signedFieldNames, secretKey) {
  const message = String(signedFieldNames)
    .split(',')
    .map((name) => `${name}=${fields[name] ?? ''}`)
    .join(',');
  return sign(message, secretKey);
}

/** Stored settings; first use creates them with eSewa's test credentials, switched off. */
async function getEsewaSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  let doc = await PaymentGateway.findOne({ key: 'esewa' }).lean();
  if (!doc) {
    doc = (
      await PaymentGateway.findOneAndUpdate(
        { key: 'esewa' },
        {
          $setOnInsert: {
            key: 'esewa',
            enabled: false,
            mode: 'sandbox',
            sandbox: { productCode: SANDBOX_CREDENTIALS.productCode, secretKey: sealField(SANDBOX_CREDENTIALS.secretKey) },
            live: { productCode: '', secretKey: '' },
          },
        },
        { upsert: true, new: true }
      )
    ).toObject();
  }
  cache = doc;
  cacheAt = Date.now();
  return doc;
}

function clearEsewaCache() {
  cache = null;
}

/** Product code + plain secret for one mode. */
function credentialsFor(settings, mode) {
  const set = settings?.[mode] || {};
  return { mode, productCode: set.productCode || '', secretKey: openField(set.secretKey || ''), urls: URLS[mode] };
}

/** Intent product code + plain access key; test mode falls back to eSewa's public test keys. */
function intentCredentialsFor(settings, mode) {
  const set = settings?.intent?.[mode] || {};
  let productCode = set.productCode || '';
  let secretKey = openField(set.secretKey || '');
  if (mode === 'sandbox' && !productCode && !secretKey) {
    productCode = INTENT_SANDBOX_CREDENTIALS.productCode;
    secretKey = INTENT_SANDBOX_CREDENTIALS.secretKey;
  }
  return { mode, productCode, secretKey, base: INTENT_BASE[mode] };
}

/** Whether new payments in this mode should open the eSewa app. */
function intentReady(settings, mode = settings?.mode) {
  if (settings?.intent?.enabled === false) return false;
  if (mode === 'sandbox' && settings?.intent?.sandboxApp !== true) return false;
  const creds = intentCredentialsFor(settings, mode);
  return Boolean(creds.productCode && creds.secretKey);
}

function isConfigured(settings, mode = settings?.mode) {
  const creds = credentialsFor(settings, mode);
  return Boolean(creds.productCode && creds.secretKey) || intentReady(settings, mode);
}

/** Whether this user may pay with eSewa right now (test mode stays with staff and testers). */
function canUseEsewa(settings, user, { isStaff = false } = {}) {
  if (!settings?.enabled || !isConfigured(settings)) return false;
  if (settings.mode === 'live' || settings.sandboxOpen) return true;
  return Boolean(isStaff || user?.isTester);
}

/** Alphanumeric and hyphen only, unique per attempt. */
function newTransactionUuid() {
  return `KB-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`.toUpperCase();
}

function amountText(value) {
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Form fields the buyer's browser posts to eSewa. */
function checkoutForm({ creds, amount, transactionUuid, successUrl, failureUrl }) {
  const total = amountText(amount);
  const fields = {
    amount: total,
    tax_amount: '0',
    total_amount: total,
    transaction_uuid: transactionUuid,
    product_code: creds.productCode,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: successUrl,
    failure_url: failureUrl,
    signed_field_names: REQUEST_SIGNED_FIELDS,
  };
  fields.signature = signFields(fields, REQUEST_SIGNED_FIELDS, creds.secretKey);
  return { formUrl: creds.urls.form, fields };
}

/** The base64 `data` eSewa appends to success_url; null when it is not valid JSON. */
function decodeResponse(data) {
  if (!data || typeof data !== 'string') return null;
  try {
    // Query parsing turns '+' into spaces.
    const json = Buffer.from(data.replace(/ /g, '+'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function verifyResponse(payload, secretKey) {
  if (!payload?.signature || !payload?.signed_field_names) return false;
  const expected = signFields(payload, payload.signed_field_names, secretKey);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(payload.signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseAmount(value) {
  return Number(String(value ?? '').replace(/,/g, ''));
}

/**
 * Ask eSewa for the final state of a payment.
 * Returns `{ status, refId, totalAmount }`, or `{ status: 'ERROR', message }` when eSewa can't be reached.
 */
async function checkStatus({ creds, amount, transactionUuid }) {
  const url = new URL(creds.urls.status);
  url.searchParams.set('product_code', creds.productCode);
  url.searchParams.set('total_amount', amountText(amount));
  url.searchParams.set('transaction_uuid', transactionUuid);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!body) return { status: 'ERROR', message: `eSewa answered ${response.status}` };
    if (body.error_message || body.code === 0) return { status: 'ERROR', message: body.error_message || 'eSewa is unavailable' };
    return {
      status: String(body.status || '').toUpperCase(),
      refId: body.ref_id || '',
      totalAmount: parseAmount(body.total_amount),
      transactionUuid: body.transaction_uuid,
      productCode: body.product_code,
    };
  } catch (error) {
    return { status: 'ERROR', message: error.name === 'AbortError' ? 'eSewa did not answer in time' : 'Could not reach eSewa' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Opens a throwaway NPR 10 checkout to prove the secret key signs correctly. No money moves:
 * eSewa only creates a page session that expires. `{ ok }`, or `{ ok: false, badKey, message }`.
 */
async function verifyKey(creds) {
  const transactionUuid = `KB-KEY-${Date.now().toString(36).toUpperCase()}`;
  const fields = {
    amount: '10',
    tax_amount: '0',
    total_amount: '10',
    transaction_uuid: transactionUuid,
    product_code: creds.productCode,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: 'https://kinbech.com/esewa-key-check',
    failure_url: 'https://kinbech.com/esewa-key-check',
    signed_field_names: REQUEST_SIGNED_FIELDS,
  };
  fields.signature = signFields(fields, REQUEST_SIGNED_FIELDS, creds.secretKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(creds.urls.form, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) return { ok: true };
    const body = await response.json().catch(() => null);
    if (body?.code === 'ES104' || /signature/i.test(body?.message || '')) {
      return { ok: false, badKey: true, message: 'eSewa rejected the secret key (invalid signature).' };
    }
    return { ok: false, message: body?.message || `eSewa payment page answered ${response.status}` };
  } catch (error) {
    return { ok: false, message: error.name === 'AbortError' ? 'eSewa payment page did not answer in time' : 'Could not reach the eSewa payment page' };
  } finally {
    clearTimeout(timer);
  }
}

async function intentPost(creds, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${creds.base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => null);
    if (!json) return { ok: false, message: `eSewa answered ${response.status}` };
    if (!json.data) return { ok: false, code: json.code, message: json.error_message || json.message || 'eSewa refused the request' };
    return { ok: true, code: json.code, data: json.data };
  } catch (error) {
    return { ok: false, message: error.name === 'AbortError' ? 'eSewa did not answer in time' : 'Could not reach eSewa' };
  } finally {
    clearTimeout(timer);
  }
}

/** Book an Intent payment. `{ ok, bookingId, deeplink, correlationId }` or `{ ok: false, message }`. */
async function bookIntent({ creds, amount, transactionUuid, callbackUrl, redirectUrl, properties = {} }) {
  const fields = {
    product_code: creds.productCode,
    amount: amountText(amount),
    transaction_uuid: transactionUuid,
  };
  const result = await intentPost(creds, 'book', {
    ...fields,
    amount: Number(fields.amount),
    signed_field_names: INTENT_BOOK_FIELDS,
    signature: signFields(fields, INTENT_BOOK_FIELDS, creds.secretKey),
    callback_url: callbackUrl,
    redirect_url: redirectUrl,
    properties,
  });
  if (!result.ok) return result;
  const { booking_id: bookingId, deeplink, correlation_id: correlationId } = result.data;
  if (!bookingId || !deeplink) return { ok: false, message: 'eSewa did not return a payment link' };
  return { ok: true, bookingId, deeplink, correlationId: correlationId || '' };
}

/**
 * Final state of an Intent payment: BOOKED, SUCCESS, PENDING, FAILED, CANCELED or REVERTED.
 * `{ status: 'ERROR', message }` when eSewa can't be reached.
 */
async function intentStatus({ creds, bookingId, correlationId }) {
  const fields = { booking_id: bookingId, product_code: creds.productCode, correlation_id: correlationId };
  const result = await intentPost(creds, 'status', {
    ...fields,
    signed_field_names: INTENT_STATUS_FIELDS,
    signature: signFields(fields, INTENT_STATUS_FIELDS, creds.secretKey),
  });
  if (!result.ok) return { status: 'ERROR', message: result.message };
  return {
    status: String(result.data.status || '').toUpperCase(),
    referenceCode: result.data.reference_code || '',
    transactionUuid: result.data.transaction_id || '',
  };
}

async function cancelIntent({ creds, bookingId }) {
  const fields = { booking_id: bookingId, product_code: creds.productCode };
  return intentPost(creds, 'cancel', {
    ...fields,
    signed_field_names: INTENT_CANCEL_FIELDS,
    signature: signFields(fields, INTENT_CANCEL_FIELDS, creds.secretKey),
  });
}

module.exports = {
  URLS,
  SANDBOX_CREDENTIALS,
  INTENT_SANDBOX_CREDENTIALS,
  intentCredentialsFor,
  intentReady,
  bookIntent,
  intentStatus,
  cancelIntent,
  getEsewaSettings,
  clearEsewaCache,
  credentialsFor,
  isConfigured,
  canUseEsewa,
  newTransactionUuid,
  checkoutForm,
  decodeResponse,
  verifyResponse,
  parseAmount,
  checkStatus,
  signFields,
  verifyKey,
};
