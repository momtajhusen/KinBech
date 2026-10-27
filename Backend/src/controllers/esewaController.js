const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const SubscriptionRequest = require('../models/SubscriptionRequest');
const PaymentGateway = require('../models/PaymentGateway');
const { isAdminRole } = require('../utils/adminScopes');
const { sealField, maskValue } = require('../utils/fieldCrypto');
const { recordAudit } = require('../utils/audit');
const esewa = require('../utils/esewa');
const {
  activatePlan,
  presentRequest,
  presentSubscription,
  sellerAccountType,
  planFitsAccount,
} = require('./subscriptionController');
const { activeSubscription } = require('../utils/listingSpamGuard');

/** eSewa ends a checkout session after 15 minutes; unanswered attempts older than this are closed. */
const SESSION_MS = 20 * 60 * 1000;
const FAILED_STATUSES = new Set(['NOT_FOUND', 'CANCELED', 'FULL_REFUND', 'PARTIAL_REFUND']);
const RETURN_PATH = '/subscriptions/esewa/return';
const INTENT_RETURN_PATH = '/subscriptions/esewa/intent-return';
const INTENT_CALLBACK_PATH = '/subscriptions/esewa/intent-callback';

function publicBase(req, settings) {
  if (settings.publicApiUrl) return settings.publicApiUrl.replace(/\/+$/, '');
  const proto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host');
  const versioned = req.originalUrl.startsWith('/v1/') ? '/v1' : '';
  return `${proto}://${host}${versioned}`;
}

/**
 * Confirm an online attempt with eSewa and approve it when paid. Safe to call many times:
 * only one caller moves a row out of `initiated`.
 * Returns { state: 'approved' | 'pending' | 'failed', message }.
 */
async function settlePayment(row, { data, outcome } = {}) {
  if (row.status === 'approved') return { state: 'approved', message: 'Payment confirmed' };
  if (row.status !== 'initiated') return { state: 'failed', message: 'This payment was not completed' };
  if (row.gatewayFlow === 'intent') return settleIntent(row, { outcome });

  const settings = await esewa.getEsewaSettings();
  const creds = esewa.credentialsFor(settings, row.gatewayMode || settings.mode);
  if (!creds.productCode || !creds.secretKey) return { state: 'pending', message: 'eSewa is not set up' };

  // The redirect data is only a hint; the status API decides.
  const payload = esewa.decodeResponse(data);
  const signed = payload && esewa.verifyResponse(payload, creds.secretKey) && payload.transaction_uuid === row.transactionUuid;

  const result = await esewa.checkStatus({ creds, amount: row.price, transactionUuid: row.transactionUuid });
  if (result.status === 'ERROR') {
    return { state: 'pending', message: `${result.message}. We will check again shortly.` };
  }

  const paid =
    result.status === 'COMPLETE' &&
    (!result.transactionUuid || result.transactionUuid === row.transactionUuid) &&
    Math.abs(result.totalAmount - row.price) < 0.01;

  if (paid) {
    const claimed = await SubscriptionRequest.findOneAndUpdate(
      { _id: row._id, status: 'initiated' },
      {
        $set: {
          status: 'approved',
          gatewayStatus: result.status,
          gatewayRef: result.refId || (signed ? payload.transaction_code : '') || '',
          reference: (result.refId || (signed ? payload.transaction_code : '') || row.transactionUuid).slice(0, 80),
          reviewedAt: new Date(),
          verifiedAt: new Date(),
        },
      },
      { new: true }
    );
    if (claimed) await activatePlan(claimed);
    return { state: 'approved', message: 'Payment confirmed' };
  }

  const expired = Date.now() - new Date(row.createdAt).getTime() > SESSION_MS;
  if (FAILED_STATUSES.has(result.status) && (outcome === 'failure' || expired || result.status !== 'NOT_FOUND')) {
    await SubscriptionRequest.updateOne(
      { _id: row._id, status: 'initiated' },
      { $set: { status: 'failed', gatewayStatus: result.status, verifiedAt: new Date() } }
    );
    return { state: 'failed', message: result.status === 'NOT_FOUND' ? 'The payment was not completed' : `eSewa says ${result.status.toLowerCase().replace('_', ' ')}` };
  }
  if (result.status === 'COMPLETE') {
    // Paid, but not the amount or transaction we asked for: keep it for an admin to look at.
    await SubscriptionRequest.updateOne(
      { _id: row._id, status: 'initiated' },
      { $set: { status: 'pending', gatewayStatus: 'MISMATCH', gatewayRef: result.refId || '', note: `eSewa paid ${result.totalAmount}, expected ${row.price}` } }
    );
    return { state: 'pending', message: 'Payment received but needs a manual check. We will update you soon.' };
  }
  await SubscriptionRequest.updateOne({ _id: row._id }, { $set: { gatewayStatus: result.status } });
  if (outcome === 'failure' || result.status === 'NOT_FOUND') return { state: 'failed', message: 'The payment was not completed' };
  return { state: 'pending', message: 'eSewa is still processing this payment' };
}

const INTENT_FAILED = new Set(['FAILED', 'CANCELED', 'REVERTED']);

/**
 * Intent payments: eSewa's status API decides. A booking left unpaid is cancelled with eSewa
 * when the buyer gives up (`outcome: 'failure'`) or the session runs out.
 */
async function settleIntent(row, { outcome } = {}) {
  const settings = await esewa.getEsewaSettings();
  const creds = esewa.intentCredentialsFor(settings, row.gatewayMode || settings.mode);
  if (!creds.productCode || !creds.secretKey) return { state: 'pending', message: 'eSewa is not set up' };

  const result = await esewa.intentStatus({ creds, bookingId: row.bookingId, correlationId: row.correlationId });
  if (result.status === 'ERROR') {
    return { state: 'pending', message: `${result.message}. We will check again shortly.` };
  }

  if (result.status === 'SUCCESS') {
    const ref = result.referenceCode || row.bookingId;
    const claimed = await SubscriptionRequest.findOneAndUpdate(
      { _id: row._id, status: 'initiated' },
      {
        $set: {
          status: 'approved',
          gatewayStatus: 'SUCCESS',
          gatewayRef: ref,
          reference: String(ref).slice(0, 80),
          reviewedAt: new Date(),
          verifiedAt: new Date(),
        },
      },
      { new: true }
    );
    if (claimed) await activatePlan(claimed);
    return { state: 'approved', message: 'Payment confirmed' };
  }

  const expired = Date.now() - new Date(row.createdAt).getTime() > SESSION_MS;
  if (result.status === 'BOOKED' && (outcome === 'failure' || expired)) {
    const cancelled = await esewa.cancelIntent({ creds, bookingId: row.bookingId });
    // eSewa refuses to cancel a booking that was just paid; look again before giving up.
    if (!cancelled.ok) {
      const again = await esewa.intentStatus({ creds, bookingId: row.bookingId, correlationId: row.correlationId });
      if (again.status === 'SUCCESS') return settleIntent(row);
    }
    result.status = 'CANCELED';
  }

  if (INTENT_FAILED.has(result.status)) {
    await SubscriptionRequest.updateOne(
      { _id: row._id, status: 'initiated' },
      { $set: { status: 'failed', gatewayStatus: result.status, verifiedAt: new Date() } }
    );
    return { state: 'failed', message: result.status === 'CANCELED' ? 'The payment was not completed' : `eSewa says ${result.status.toLowerCase()}` };
  }

  await SubscriptionRequest.updateOne({ _id: row._id }, { $set: { gatewayStatus: result.status } });
  if (result.status === 'BOOKED') return { state: 'unpaid', message: 'You have not paid in eSewa yet' };
  return { state: 'pending', message: 'eSewa is still processing this payment' };
}

/** Check a seller's unanswered attempts from the last day (called when they open Plans). */
async function settleOpenEsewaPayments(userId) {
  const rows = await SubscriptionRequest.find({
    user: userId,
    gateway: 'esewa',
    status: 'initiated',
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), $lte: new Date(Date.now() - 60 * 1000) },
  })
    .sort({ createdAt: -1 })
    .limit(3);
  let approved = 0;
  for (const row of rows) {
    const result = await settlePayment(row);
    if (result.state === 'approved') approved += 1;
  }
  return approved;
}

// ---------- Seller ----------

/** POST /subscriptions/esewa/start { planId } -> form the app posts to eSewa inside a WebView. */
async function startPayment(req, res, next) {
  try {
    const settings = await esewa.getEsewaSettings();
    if (!esewa.canUseEsewa(settings, req.user, { isStaff: isAdminRole(req.user.role) })) {
      return res.status(403).json({ message: 'eSewa payment is not available right now. Send the payment manually instead.' });
    }
    const { planId } = req.body || {};
    if (!mongoose.isValidObjectId(planId)) return res.status(400).json({ message: 'Choose a plan' });
    const plan = await SubscriptionPlan.findOne({ _id: planId, active: true }).lean();
    if (!plan) return res.status(404).json({ message: 'This plan is no longer available' });
    if (!(plan.price > 0)) return res.status(400).json({ message: 'This plan has no price to pay' });
    if (!planFitsAccount(plan, await sellerAccountType(req.user))) {
      return res.status(400).json({ message: 'This is a store plan. Open a store first to buy it.' });
    }

    const recent = await SubscriptionRequest.countDocuments({
      user: req.user._id,
      gateway: 'esewa',
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (recent >= 10) return res.status(429).json({ message: 'Too many payment attempts. Try again in an hour.' });

    const transactionUuid = esewa.newTransactionUuid();
    const wantsIntent = req.body?.flow === 'intent' && esewa.intentReady(settings, settings.mode);
    const formReady = Boolean(esewa.credentialsFor(settings, settings.mode).secretKey);
    if (!wantsIntent && !formReady) {
      return res.status(503).json({ message: 'eSewa payment is not available right now. Please update the app.' });
    }
    const row = await SubscriptionRequest.create({
      user: req.user._id,
      plan: plan._id,
      planName: plan.name,
      price: plan.price,
      durationDays: plan.durationDays,
      individualDailyListings: plan.individualDailyListings ?? null,
      shopDailyListings: plan.shopDailyListings ?? null,
      method: 'esewa',
      reference: transactionUuid,
      status: 'initiated',
      gateway: 'esewa',
      gatewayMode: settings.mode,
      gatewayFlow: 'form',
      transactionUuid,
    });

    const api = publicBase(req, settings);
    if (wantsIntent) {
      const booking = await esewa.bookIntent({
        creds: esewa.intentCredentialsFor(settings, settings.mode),
        amount: plan.price,
        transactionUuid,
        callbackUrl: `${api}${INTENT_CALLBACK_PATH}/${row._id}`,
        redirectUrl: `${api}${INTENT_RETURN_PATH}/${row._id}`,
        properties: { customer_id: String(req.user._id), remarks: `KinBech ${plan.name} plan` },
      });
      if (booking.ok) {
        await SubscriptionRequest.updateOne(
          { _id: row._id },
          { $set: { gatewayFlow: 'intent', bookingId: booking.bookingId, correlationId: booking.correlationId } }
        );
        return res.status(201).json({
          paymentId: String(row._id),
          flow: 'intent',
          mode: settings.mode,
          amount: plan.price,
          planName: plan.name,
          deeplink: booking.deeplink,
        });
      }
      console.warn('[esewa] intent booking failed, using the web page:', booking.message);
      if (!formReady) {
        await SubscriptionRequest.updateOne({ _id: row._id }, { $set: { status: 'failed', gatewayStatus: 'BOOK_FAILED' } });
        return res.status(502).json({ message: `Could not open eSewa: ${booking.message}` });
      }
    }

    const base = `${api}${RETURN_PATH}/${row._id}`;
    const creds = esewa.credentialsFor(settings, settings.mode);
    const form = esewa.checkoutForm({
      creds,
      amount: plan.price,
      transactionUuid,
      successUrl: `${base}/success`,
      failureUrl: `${base}/failure`,
    });
    res.status(201).json({
      paymentId: String(row._id),
      flow: 'form',
      mode: settings.mode,
      amount: plan.price,
      planName: plan.name,
      formUrl: form.formUrl,
      fields: form.fields,
      returnUrl: base,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /subscriptions/esewa/payments/:id/verify { data?, outcome? } */
async function verifyPayment(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid payment' });
    const row = await SubscriptionRequest.findOne({ _id: req.params.id, user: req.user._id, gateway: 'esewa' });
    if (!row) return res.status(404).json({ message: 'Payment not found' });
    const outcome = req.body?.outcome === 'failure' ? 'failure' : req.body?.outcome === 'success' ? 'success' : undefined;
    const result = await settlePayment(row, { data: req.body?.data, outcome });
    const [fresh, user] = await Promise.all([
      SubscriptionRequest.findById(row._id).lean(),
      result.state === 'approved' ? mongoose.model('User').findById(req.user._id).lean() : null,
    ]);
    res.json({
      ...result,
      request: presentRequest(fresh),
      subscription: user ? presentSubscription(activeSubscription(user)) : null,
    });
  } catch (error) {
    next(error);
  }
}

function returnPage({ title, body, ok }) {
  const tone = ok ? '#047857' : '#B45309';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>body{margin:0;font-family:system-ui,sans-serif;background:#F4F7F5;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{max-width:340px;margin:24px;padding:28px;border-radius:20px;background:#fff;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08)}
.dot{width:56px;height:56px;border-radius:50%;margin:0 auto 14px;background:${tone};color:#fff;font-size:30px;line-height:56px}
h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#555;line-height:1.5}</style></head>
<body><div class="card"><div class="dot">${ok ? '&#10003;' : '!'}</div><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

/** GET /subscriptions/esewa/return/:id/:outcome — eSewa sends the buyer here (success_url / failure_url). */
async function paymentReturn(req, res) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.type('html');
  try {
    const outcome = req.params.outcome === 'success' ? 'success' : 'failure';
    const row = mongoose.isValidObjectId(req.params.id)
      ? await SubscriptionRequest.findOne({ _id: req.params.id, gateway: 'esewa' })
      : null;
    if (!row) return res.status(404).send(returnPage({ title: 'Payment not found', body: 'Go back to KinBech and try again.' }));
    const result = await settlePayment(row, { data: typeof req.query.data === 'string' ? req.query.data : undefined, outcome });
    if (result.state === 'approved') {
      return res.send(returnPage({ ok: true, title: 'Payment successful', body: `${row.planName} is now active. Go back to the KinBech app.` }));
    }
    if (result.state === 'pending') {
      return res.send(returnPage({ title: 'Checking your payment', body: `${result.message} Open Plans in the KinBech app to see the result.` }));
    }
    return res.send(returnPage({ title: 'Payment not completed', body: 'No money was taken for this attempt. Go back to KinBech and try again.' }));
  } catch {
    return res.status(500).send(returnPage({ title: 'Something went wrong', body: 'Open Plans in the KinBech app to see your payment status.' }));
  }
}

async function findIntentRow(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return SubscriptionRequest.findOne({ _id: id, gateway: 'esewa', gatewayFlow: 'intent' });
}

/** GET /subscriptions/esewa/intent-return/:id — the eSewa app sends the buyer here (redirect_url). */
async function intentReturn(req, res) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.type('html');
  try {
    const row = await findIntentRow(req.params.id);
    if (!row) return res.status(404).send(returnPage({ title: 'Payment not found', body: 'Go back to KinBech and try again.' }));
    const result = await settlePayment(row);
    if (result.state === 'approved') {
      return res.send(returnPage({ ok: true, title: 'Payment successful', body: `${row.planName} is now active. Go back to the KinBech app.` }));
    }
    if (result.state === 'failed') {
      return res.send(returnPage({ title: 'Payment not completed', body: 'No money was taken for this attempt. Go back to KinBech and try again.' }));
    }
    return res.send(returnPage({ title: 'Checking your payment', body: 'Go back to the KinBech app. Your plan turns on as soon as eSewa confirms.' }));
  } catch {
    return res.status(500).send(returnPage({ title: 'Something went wrong', body: 'Open Plans in the KinBech app to see your payment status.' }));
  }
}

/** POST /subscriptions/esewa/intent-callback/:id — eSewa's server-to-server notice. The status API still decides. */
async function intentCallback(req, res) {
  try {
    const row = await findIntentRow(req.params.id);
    if (row && row.status === 'initiated') await settlePayment(row);
  } catch (error) {
    console.warn('[esewa] intent callback:', error.message);
  }
  res.json({ received: true });
}

// ---------- Admin ----------

function presentCredentials(set = {}) {
  return {
    productCode: set.productCode || '',
    secretKeySet: Boolean(set.secretKey),
    secretKeyHint: set.secretKey ? maskValue(set.secretKey) : '',
  };
}

function presentSettings(settings) {
  return {
    enabled: Boolean(settings.enabled),
    mode: settings.mode,
    sandboxOpen: Boolean(settings.sandboxOpen),
    publicApiUrl: settings.publicApiUrl || '',
    sandbox: presentCredentials(settings.sandbox),
    live: presentCredentials(settings.live),
    intent: {
      enabled: settings.intent?.enabled !== false,
      sandboxApp: settings.intent?.sandboxApp === true,
      sandbox: presentCredentials(settings.intent?.sandbox),
      live: presentCredentials(settings.intent?.live),
      ready: { sandbox: esewa.intentReady(settings, 'sandbox'), live: esewa.intentReady(settings, 'live') },
    },
    configured: { sandbox: esewa.isConfigured(settings, 'sandbox'), live: esewa.isConfigured(settings, 'live') },
    urls: esewa.URLS,
    updatedAt: settings.updatedAt,
  };
}

/** GET /subscriptions/admin/gateway/esewa */
async function adminGetSettings(req, res, next) {
  try {
    const settings = await esewa.getEsewaSettings({ fresh: true });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await SubscriptionRequest.aggregate([
      { $match: { gateway: 'esewa', createdAt: { $gte: since } } },
      { $group: { _id: { status: '$status', mode: '$gatewayMode' }, count: { $sum: 1 }, amount: { $sum: '$price' } } },
    ]);
    res.json({ settings: presentSettings(settings), stats: rows.map((row) => ({ ...row._id, count: row.count, amount: row.amount })) });
  } catch (error) {
    next(error);
  }
}

function readCredentials(input, current = {}) {
  if (!input || typeof input !== 'object') return { value: current };
  const productCode = input.productCode === undefined ? current.productCode || '' : String(input.productCode).trim();
  if (productCode.length > 60) return { error: 'Product code is too long' };
  const secret = typeof input.secretKey === 'string' ? input.secretKey.trim() : '';
  if (secret.length > 200) return { error: 'Secret key is too long' };
  return { value: { productCode, secretKey: secret ? sealField(secret) : current.secretKey || '' } };
}

/** PUT /subscriptions/admin/gateway/esewa — empty secret fields keep the saved key. */
async function adminSaveSettings(req, res, next) {
  try {
    const body = req.body || {};
    const current = await esewa.getEsewaSettings({ fresh: true });
    const sandbox = readCredentials(body.sandbox, current.sandbox);
    if (sandbox.error) return res.status(400).json({ message: sandbox.error });
    const live = readCredentials(body.live, current.live);
    if (live.error) return res.status(400).json({ message: live.error });
    const intentBody = body.intent && typeof body.intent === 'object' ? body.intent : {};
    const intentSandbox = readCredentials(intentBody.sandbox, current.intent?.sandbox);
    if (intentSandbox.error) return res.status(400).json({ message: `Intent: ${intentSandbox.error}` });
    const intentLive = readCredentials(intentBody.live, current.intent?.live);
    if (intentLive.error) return res.status(400).json({ message: `Intent: ${intentLive.error}` });
    const mode = body.mode === undefined ? current.mode : body.mode;
    if (!['sandbox', 'live'].includes(mode)) return res.status(400).json({ message: 'Mode must be test or live' });
    const enabled = body.enabled === undefined ? current.enabled : Boolean(body.enabled);
    const publicApiUrl = body.publicApiUrl === undefined ? current.publicApiUrl || '' : String(body.publicApiUrl).trim().replace(/\/+$/, '');
    if (publicApiUrl && !/^https?:\/\/[^\s]+$/i.test(publicApiUrl)) return res.status(400).json({ message: 'Public API URL must start with https://' });

    const update = {
      enabled,
      mode,
      sandboxOpen: body.sandboxOpen === undefined ? Boolean(current.sandboxOpen) : Boolean(body.sandboxOpen),
      publicApiUrl,
      sandbox: sandbox.value,
      live: live.value,
      intent: {
        enabled: intentBody.enabled === undefined ? current.intent?.enabled !== false : Boolean(intentBody.enabled),
        sandboxApp: intentBody.sandboxApp === undefined ? current.intent?.sandboxApp === true : Boolean(intentBody.sandboxApp),
        sandbox: intentSandbox.value,
        live: intentLive.value,
      },
      updatedBy: req.user._id,
    };
    if (enabled && !esewa.isConfigured(update, mode)) {
      return res.status(400).json({ message: `Add the ${mode === 'live' ? 'live' : 'test'} product code and secret key before turning eSewa on` });
    }
    await PaymentGateway.updateOne({ key: 'esewa' }, { $set: update }, { upsert: true });
    esewa.clearEsewaCache();
    const saved = await esewa.getEsewaSettings({ fresh: true });

    const changed = [
      ...['sandbox', 'live'].filter((m) => typeof body[m]?.secretKey === 'string' && body[m].secretKey.trim()),
      ...['sandbox', 'live']
        .filter((m) => typeof intentBody[m]?.secretKey === 'string' && intentBody[m].secretKey.trim())
        .map((m) => `${m} intent`),
    ];
    await recordAudit(req, {
      action: 'payment.esewa.update',
      targetType: 'settings',
      summary: `eSewa ${enabled ? 'on' : 'off'} in ${mode === 'live' ? 'live' : 'test'} mode${changed.length ? `; replaced ${changed.join(' and ')} secret key` : ''}`,
    });
    res.json({ settings: presentSettings(saved) });
  } catch (error) {
    next(error);
  }
}

/** POST /subscriptions/admin/gateway/esewa/sandbox-defaults — put eSewa's public test credentials back. */
async function adminUseSandboxDefaults(req, res, next) {
  try {
    await PaymentGateway.updateOne(
      { key: 'esewa' },
      {
        $set: {
          'sandbox.productCode': esewa.SANDBOX_CREDENTIALS.productCode,
          'sandbox.secretKey': sealField(esewa.SANDBOX_CREDENTIALS.secretKey),
          updatedBy: req.user._id,
        },
      },
      { upsert: true }
    );
    esewa.clearEsewaCache();
    res.json({ settings: presentSettings(await esewa.getEsewaSettings({ fresh: true })) });
  } catch (error) {
    next(error);
  }
}

/** Books a throwaway NPR 10 Intent payment and cancels it at once, to prove the access key works. */
async function testIntent(settings, mode) {
  if (settings.intent?.enabled === false) return { ok: true, message: 'off, sellers use the web page.' };
  if (mode === 'sandbox' && settings.intent?.sandboxApp !== true) {
    return { ok: true, message: 'test payments use the web page (the Play Store eSewa app cannot open test bookings).' };
  }
  if (!esewa.intentReady(settings, mode)) return { ok: true, message: 'no product code or access key yet, sellers use the web page.' };
  const creds = esewa.intentCredentialsFor(settings, mode);
  const booking = await esewa.bookIntent({
    creds,
    amount: 10,
    transactionUuid: `KB-KEYI-${Date.now().toString(36).toUpperCase()}`,
    callbackUrl: 'https://kinbech.com/esewa-key-check',
    redirectUrl: 'https://kinbech.com/esewa-key-check',
    properties: { remarks: 'KinBech connection check' },
  });
  if (!booking.ok) return { ok: false, message: `eSewa refused the booking: ${booking.message}. Check the Intent product code and access key.` };
  await esewa.cancelIntent({ creds, bookingId: booking.bookingId });
  return { ok: true, message: `connected, product code ${creds.productCode} and access key are correct.` };
}

/** POST /subscriptions/admin/gateway/esewa/test { mode } — reach eSewa's status API with these credentials. */
async function adminTestConnection(req, res, next) {
  try {
    const settings = await esewa.getEsewaSettings({ fresh: true });
    const mode = req.body?.mode === 'live' ? 'live' : req.body?.mode === 'sandbox' ? 'sandbox' : settings.mode;
    const creds = esewa.credentialsFor(settings, mode);
    if (!creds.productCode) return res.status(400).json({ message: 'Add a product code first' });
    if (!creds.secretKey) return res.status(400).json({ message: 'Add the secret key first' });
    const label = mode === 'live' ? 'live' : 'test';
    const started = Date.now();
    const result = await esewa.checkStatus({ creds, amount: 1, transactionUuid: `KB-CHECK-${Date.now().toString(36).toUpperCase()}` });
    if (result.status === 'ERROR') {
      return res.json({ ok: false, mode, ms: Date.now() - started, message: `Could not reach the eSewa ${label} server: ${result.message}` });
    }
    const key = await esewa.verifyKey(creds);
    if (!key.ok) {
      const hint = key.badKey
        ? mode === 'sandbox'
          ? ' Click "Use eSewa test credentials" to put the right test key back, then save.'
          : ' Paste the ePay v2 secret key eSewa gave you for this merchant (not the mobile SDK client secret).'
        : '';
      return res.json({ ok: false, mode, ms: Date.now() - started, message: `${key.message}${hint}` });
    }
    const intent = await testIntent(settings, mode);
    const ms = Date.now() - started;
    res.json({
      ok: intent.ok,
      mode,
      ms,
      message: `Web page: connected, product code ${creds.productCode} and secret key are correct. eSewa app: ${intent.message} (${ms} ms)`,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  settlePayment,
  settleOpenEsewaPayments,
  startPayment,
  verifyPayment,
  paymentReturn,
  intentReturn,
  intentCallback,
  adminGetSettings,
  adminSaveSettings,
  adminUseSandboxDefaults,
  adminTestConnection,
};
