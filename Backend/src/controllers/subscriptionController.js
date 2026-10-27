const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const SubscriptionRequest = require('../models/SubscriptionRequest');
const PlatformSettings = require('../models/PlatformSettings');
const Notification = require('../models/Notification');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { postQuota, activeSubscription } = require('../utils/listingSpamGuard');
const { MAX_DAILY_LISTINGS } = require('../utils/platformSettings');
const { sendUserPush } = require('../utils/callPush');
const { recordAudit } = require('../utils/audit');
const { isAdminRole } = require('../utils/adminScopes');
const { getEsewaSettings, canUseEsewa } = require('../utils/esewa');

const DAY = 24 * 60 * 60 * 1000;
const METHODS = ['esewa', 'khalti', 'ime', 'bank'];
const METHOD_LABELS = { esewa: 'eSewa', khalti: 'Khalti', ime: 'IME Pay', bank: 'Bank transfer' };
const PAYMENT_KEYS = ['esewa', 'khalti', 'ime', 'bank', 'note'];

function badRequest(res, message) {
  return res.status(400).json({ message });
}

function presentPlan(plan) {
  return {
    id: String(plan._id),
    name: plan.name,
    tagline: plan.tagline || '',
    price: plan.price,
    durationDays: plan.durationDays,
    individualDailyListings: plan.individualDailyListings ?? null,
    shopDailyListings: plan.shopDailyListings ?? null,
    features: plan.features || [],
    highlight: Boolean(plan.highlight),
    active: Boolean(plan.active),
    sortOrder: plan.sortOrder || 0,
  };
}

/** Bill number shown to the seller and admins. Online payments use the ID sent to the gateway. */
function receiptNo(row) {
  return row.transactionUuid || `KB-${String(row._id).slice(-8).toUpperCase()}`;
}

function presentRequest(row) {
  return {
    id: String(row._id),
    receiptNo: receiptNo(row),
    planId: String(row.plan?._id || row.plan),
    planName: row.planName,
    price: row.price,
    durationDays: row.durationDays,
    individualDailyListings: row.individualDailyListings ?? null,
    shopDailyListings: row.shopDailyListings ?? null,
    method: row.method,
    methodLabel: METHOD_LABELS[row.method] || row.method,
    reference: row.reference,
    note: row.note || '',
    status: row.status,
    gateway: row.gateway || null,
    gatewayMode: row.gatewayMode || null,
    gatewayRef: row.gatewayRef || '',
    gatewayStatus: row.gatewayStatus || '',
    verifiedAt: row.verifiedAt || null,
    rejectReason: row.rejectReason || '',
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
  };
}

function presentSubscription(sub) {
  if (!sub) return null;
  return {
    planId: sub.plan ? String(sub.plan) : null,
    name: sub.name,
    individualDailyListings: sub.individualDailyListings ?? null,
    shopDailyListings: sub.shopDailyListings ?? null,
    startsAt: sub.startsAt,
    endsAt: sub.endsAt,
    daysLeft: Math.max(0, Math.ceil((new Date(sub.endsAt).getTime() - Date.now()) / DAY)),
  };
}

async function paymentDetails() {
  const doc = await PlatformSettings.findOne({ key: 'platform' }).select('subscriptionPayment').lean();
  const saved = doc?.subscriptionPayment || {};
  return Object.fromEntries(PAYMENT_KEYS.map((key) => [key, String(saved[key] || '')]));
}

/** Approved plan payments. Test-mode gateway payments are counted apart since no real money moved. */
async function paidTotals(match = {}) {
  const since = new Date(Date.now() - 30 * DAY);
  const isTest = { $eq: ['$gatewayMode', 'sandbox'] };
  const [row] = await SubscriptionRequest.aggregate([
    { $match: { ...match, status: 'approved' } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        amount: { $sum: { $cond: [isTest, 0, '$price'] } },
        amount30d: { $sum: { $cond: [{ $and: [{ $not: [isTest] }, { $gte: ['$createdAt', since] }] }, '$price', 0] } },
        online: { $sum: { $cond: [{ $and: [{ $not: [isTest] }, { $eq: ['$gateway', 'esewa'] }] }, '$price', 0] } },
        test: { $sum: { $cond: [isTest, '$price', 0] } },
      },
    },
  ]);
  return {
    count: row?.count || 0,
    amount: row?.amount || 0,
    amount30d: row?.amount30d || 0,
    online: row?.online || 0,
    test: row?.test || 0,
  };
}

/** 'shop' for store accounts (store chosen or a shop owned), otherwise 'individual'. */
async function sellerAccountType(user) {
  if (['shop', 'both'].includes(user?.sellerTypePreference)) return 'shop';
  return (await Shop.exists({ owner: user._id })) ? 'shop' : 'individual';
}

/** Store plans (with a store limit) are hidden from individual sellers. */
function planFitsAccount(plan, accountType) {
  if (accountType === 'shop') return true;
  return plan.shopDailyListings == null && plan.individualDailyListings != null;
}

async function ownShop(userId, shopId) {
  if (shopId && mongoose.isValidObjectId(shopId)) {
    const shop = await Shop.findOne({ _id: shopId, owner: userId }).select('isVerified').lean();
    if (shop) return shop;
  }
  return Shop.findOne({ owner: userId }).select('isVerified').lean();
}

/** Daily limit field: '' or null = not in this plan, 0 = no limit, N = N posts a day. */
function readLimit(value, label) {
  if (value === null || value === undefined || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_DAILY_LISTINGS) {
    return { error: `${label} must be a whole number from 0 to ${MAX_DAILY_LISTINGS}` };
  }
  return { value: n };
}

function readPlan(body) {
  const name = String(body.name || '').trim();
  if (!name || name.length > 40) return { error: 'Plan name is required (up to 40 characters)' };
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 1000000) return { error: 'Price must be from 0 to 10,00,000' };
  const durationDays = Number(body.durationDays);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366) {
    return { error: 'Duration must be 1 to 366 days' };
  }
  const individual = readLimit(body.individualDailyListings, 'Individual posts per day');
  if (individual.error) return individual;
  const shop = readLimit(body.shopDailyListings, 'Store posts per day');
  if (shop.error) return shop;
  if (individual.value == null && shop.value == null) {
    return { error: 'Give the plan a daily limit for individual posts, store posts, or both' };
  }
  const features = (Array.isArray(body.features) ? body.features : String(body.features || '').split('\n'))
    .map((item) => String(item).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 8);
  return {
    value: {
      name,
      tagline: String(body.tagline || '').trim().slice(0, 90),
      price: Math.round(price),
      durationDays,
      individualDailyListings: individual.value,
      shopDailyListings: shop.value,
      features,
      highlight: Boolean(body.highlight),
      active: body.active === undefined ? true : Boolean(body.active),
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.round(Number(body.sortOrder)) : 0,
    },
  };
}

async function notifyUser(userId, { title, body, icon }) {
  try {
    const note = await Notification.create({ user: userId, type: 'system', title, body, icon, route: 'Subscription' });
    sendUserPush({
      userId,
      title,
      body,
      data: { type: 'subscription', route: 'Subscription', notificationId: String(note._id) },
    }).catch(() => {});
  } catch {
    /* the in-app status still shows the decision */
  }
}

/**
 * Put an approved request's plan on the seller and tell them. Renewing the same plan adds the
 * days on top of the time left. Returns null when the user no longer exists.
 */
async function activatePlan(row) {
  const user = await User.findById(row.user);
  if (!user) return null;
  const now = Date.now();
  const current = activeSubscription(user);
  const renewing = current && String(current.plan) === String(row.plan);
  const startsAt = renewing ? current.startsAt : new Date(now);
  const from = renewing ? new Date(current.endsAt).getTime() : now;
  const endsAt = new Date(from + row.durationDays * DAY);
  user.subscription = {
    plan: row.plan,
    name: row.planName,
    individualDailyListings: row.individualDailyListings,
    shopDailyListings: row.shopDailyListings,
    startsAt,
    endsAt,
  };
  await user.save();
  row.startsAt = startsAt;
  row.endsAt = endsAt;
  await row.save();

  await notifyUser(user._id, {
    title: `${row.planName} plan is active`,
    body: `Payment confirmed. Your plan runs until ${endsAt.toDateString()}. Go post your items!`,
    icon: 'rocket-outline',
  });
  return { user, startsAt, endsAt };
}

// ---------- Seller ----------

/** GET /subscriptions/plans */
async function listPlans(req, res, next) {
  try {
    const [plans, esewa, accountType] = await Promise.all([
      SubscriptionPlan.find({ active: true }).sort({ sortOrder: 1, price: 1 }).lean(),
      getEsewaSettings(),
      sellerAccountType(req.user),
    ]);
    res.json({
      plans: plans.filter((plan) => planFitsAccount(plan, accountType)).map(presentPlan),
      accountType,
      payment: await paymentDetails(),
      gateways: {
        esewa: canUseEsewa(esewa, req.user, { isStaff: isAdminRole(req.user.role) })
          ? { enabled: true, mode: esewa.mode }
          : { enabled: false, reason: esewa.enabled && esewa.mode === 'sandbox' ? 'testers_only' : 'off' },
      },
    });
  } catch (error) {
    next(error);
  }
}

/** GET /subscriptions/quota?sellerType=individual|shop&shopId= */
async function getQuota(req, res, next) {
  try {
    const sellerType = req.query.sellerType === 'shop' ? 'shop' : 'individual';
    const shop = sellerType === 'shop' ? await ownShop(req.user._id, req.query.shopId) : null;
    res.json({ quota: await postQuota(req.user, { sellerType, shop }) });
  } catch (error) {
    next(error);
  }
}

/** GET /subscriptions/me */
async function getMine(req, res, next) {
  try {
    // Online payments whose browser closed before returning are settled here.
    const { settleOpenEsewaPayments } = require('./esewaController');
    const settled = await settleOpenEsewaPayments(req.user._id).catch(() => 0);
    if (settled) req.user = (await User.findById(req.user._id)) || req.user;
    const [shop, requests] = await Promise.all([
      ownShop(req.user._id),
      SubscriptionRequest.find({ user: req.user._id, status: { $ne: 'initiated' } }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    const [individual, shopQuota] = await Promise.all([
      postQuota(req.user, { sellerType: 'individual' }),
      shop ? postQuota(req.user, { sellerType: 'shop', shop }) : null,
    ]);
    res.json({
      subscription: presentSubscription(activeSubscription(req.user)),
      pending: requests.find((row) => row.status === 'pending') ? presentRequest(requests.find((row) => row.status === 'pending')) : null,
      history: requests.map(presentRequest),
      quota: { individual, shop: shopQuota },
      hasShop: Boolean(shop),
      isTester: Boolean(req.user.isTester),
    });
  } catch (error) {
    next(error);
  }
}

/** POST /subscriptions/requests { planId, method, reference, note } */
async function createRequest(req, res, next) {
  try {
    const { planId } = req.body || {};
    const method = String(req.body?.method || '');
    const reference = String(req.body?.reference || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 300);
    if (!mongoose.isValidObjectId(planId)) return badRequest(res, 'Choose a plan');
    if (!METHODS.includes(method)) return badRequest(res, 'Choose how you paid');
    if (reference.length < 4 || reference.length > 80) {
      return badRequest(res, 'Enter the transaction ID or reference from your payment receipt');
    }
    const plan = await SubscriptionPlan.findOne({ _id: planId, active: true }).lean();
    if (!plan) return res.status(404).json({ message: 'This plan is no longer available' });
    if (!planFitsAccount(plan, await sellerAccountType(req.user))) {
      return badRequest(res, 'This is a store plan. Open a store first to buy it.');
    }

    const open = await SubscriptionRequest.findOne({ user: req.user._id, status: 'pending' }).lean();
    if (open) {
      return res.status(409).json({
        message: 'You already have a plan request waiting for review. Cancel it first to send a new one.',
        request: presentRequest(open),
      });
    }

    const row = await SubscriptionRequest.create({
      user: req.user._id,
      plan: plan._id,
      planName: plan.name,
      price: plan.price,
      durationDays: plan.durationDays,
      individualDailyListings: plan.individualDailyListings ?? null,
      shopDailyListings: plan.shopDailyListings ?? null,
      method,
      reference,
      note,
    });
    res.status(201).json({ request: presentRequest(row.toObject()) });
  } catch (error) {
    next(error);
  }
}

/** POST /subscriptions/requests/:id/cancel */
async function cancelRequest(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, 'Invalid request');
    const row = await SubscriptionRequest.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, status: 'pending' },
      { $set: { status: 'cancelled' } },
      { new: true }
    ).lean();
    if (!row) return res.status(404).json({ message: 'This request was already reviewed' });
    res.json({ request: presentRequest(row) });
  } catch (error) {
    next(error);
  }
}

/** GET /subscriptions/payments?page=1: the seller's plan bills, newest first. */
async function listPayments(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const filter = { user: req.user._id, status: { $ne: 'initiated' } };
    const [rows, total, totals] = await Promise.all([
      SubscriptionRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SubscriptionRequest.countDocuments(filter),
      paidTotals({ user: req.user._id }),
    ]);
    res.json({
      payments: rows.map(presentRequest),
      totals: { paid: totals.amount + totals.test, plans: totals.count },
      subscription: presentSubscription(activeSubscription(req.user)),
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    next(error);
  }
}

// ---------- Admin ----------

/** GET /subscriptions/admin/plans */
async function adminListPlans(req, res, next) {
  try {
    const [plans, subscriberRows, esewa] = await Promise.all([
      SubscriptionPlan.find().sort({ sortOrder: 1, price: 1 }).lean(),
      User.aggregate([
        { $match: { 'subscription.endsAt': { $gt: new Date() } } },
        { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
      ]),
      getEsewaSettings({ fresh: true }),
    ]);
    const subscribers = Object.fromEntries(subscriberRows.map((row) => [String(row._id), row.count]));
    res.json({
      plans: plans.map((plan) => ({ ...presentPlan(plan), subscribers: subscribers[String(plan._id)] || 0 })),
      payment: await paymentDetails(),
      esewa: { enabled: Boolean(esewa.enabled), mode: esewa.mode, openToAll: esewa.mode === 'live' || Boolean(esewa.sandboxOpen) },
    });
  } catch (error) {
    next(error);
  }
}

/** POST /subscriptions/admin/plans */
async function adminCreatePlan(req, res, next) {
  try {
    const parsed = readPlan(req.body || {});
    if (parsed.error) return badRequest(res, parsed.error);
    const plan = await SubscriptionPlan.create(parsed.value);
    res.status(201).json({ plan: presentPlan(plan) });
  } catch (error) {
    next(error);
  }
}

/** PUT /subscriptions/admin/plans/:id */
async function adminUpdatePlan(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, 'Invalid plan');
    const parsed = readPlan(req.body || {});
    if (parsed.error) return badRequest(res, parsed.error);
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, { $set: parsed.value }, { new: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ plan: presentPlan(plan) });
  } catch (error) {
    next(error);
  }
}

/** DELETE /subscriptions/admin/plans/:id: plans with history are hidden instead of deleted. */
async function adminDeletePlan(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, 'Invalid plan');
    const used = await SubscriptionRequest.exists({ plan: req.params.id });
    if (used) {
      await SubscriptionPlan.updateOne({ _id: req.params.id }, { $set: { active: false } });
      return res.json({ hidden: true, message: 'Sellers already bought this plan, so it was hidden instead of deleted.' });
    }
    await SubscriptionPlan.deleteOne({ _id: req.params.id });
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
}

/** PUT /subscriptions/admin/payment { esewa, khalti, ime, bank, note } */
async function adminSavePayment(req, res, next) {
  try {
    const payment = Object.fromEntries(
      PAYMENT_KEYS.map((key) => [key, String(req.body?.[key] || '').trim().slice(0, key === 'note' ? 400 : 120)])
    );
    await PlatformSettings.updateOne(
      { key: 'platform' },
      { $set: { key: 'platform', subscriptionPayment: payment } },
      { upsert: true }
    );
    res.json({ payment });
  } catch (error) {
    next(error);
  }
}

/** Search by transaction ID, bill number, plan, or the seller's name / phone. */
async function requestSearch(q) {
  const text = String(q || '').trim().slice(0, 60);
  if (!text) return {};
  const pattern = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const users = await User.find({ $or: [{ name: pattern }, { phone: pattern }] }).select('_id').limit(50).lean();
  const or = [{ reference: pattern }, { gatewayRef: pattern }, { transactionUuid: pattern }, { planName: pattern }];
  if (users.length) or.push({ user: { $in: users.map((u) => u._id) } });
  const billId = text.match(/^KB-([0-9a-f]{8})$/i);
  if (billId) {
    or.push({ $expr: { $eq: [{ $substrCP: [{ $toString: '$_id' }, 16, 8] }, billId[1].toLowerCase()] } });
  }
  return { $or: or };
}

/** GET /subscriptions/admin/requests?status=pending&page=1&q= */
async function adminListRequests(req, res, next) {
  try {
    const status = ['pending', 'approved', 'rejected', 'cancelled', 'failed'].includes(req.query.status) ? req.query.status : 'pending';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const search = await requestSearch(req.query.q);
    const [rows, total, countRows, revenue] = await Promise.all([
      SubscriptionRequest.find({ ...search, status })
        .sort({ createdAt: status === 'pending' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'name phone avatarUrl subscription')
        .populate('reviewedBy', 'name')
        .lean(),
      SubscriptionRequest.countDocuments({ ...search, status }),
      SubscriptionRequest.aggregate([{ $match: search }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      paidTotals(),
    ]);
    res.json({
      requests: rows.map((row) => ({
        ...presentRequest(row),
        user: row.user
          ? {
              id: String(row.user._id),
              name: row.user.name || '',
              phone: row.user.phone || '',
              avatarUrl: row.user.avatarUrl || '',
              currentPlan: presentSubscription(activeSubscription(row.user)),
            }
          : null,
        reviewedBy: row.reviewedBy?.name || '',
      })),
      counts: Object.fromEntries(countRows.map((row) => [row._id, row.count])),
      revenue,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      page,
    });
  } catch (error) {
    next(error);
  }
}

/** POST /subscriptions/admin/requests/:id/approve: renewing the same plan adds the days on top. */
async function adminApprove(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, 'Invalid request');
    const row = await SubscriptionRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'approved', reviewedBy: req.user._id, reviewedAt: new Date() } },
      { new: true }
    );
    if (!row) return res.status(409).json({ message: 'This request was already reviewed' });
    const activated = await activatePlan(row);
    if (!activated) return res.status(404).json({ message: 'User not found' });
    const { user, endsAt } = activated;
    await recordAudit(req, {
      action: 'subscription.approve',
      targetType: 'user',
      targetId: user._id,
      summary: `Approved ${row.planName} (Rs ${row.price}, ${METHOD_LABELS[row.method] || row.method} ${row.reference}) for ${user.name || user.phone}, until ${endsAt.toDateString()}`,
      meta: { requestId: String(row._id), endsAt },
    });
    res.json({ request: presentRequest(row.toObject()) });
  } catch (error) {
    next(error);
  }
}

/** POST /subscriptions/admin/requests/:id/reject { reason } */
async function adminReject(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, 'Invalid request');
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!reason) return badRequest(res, 'Write a reason. The seller sees it.');
    const row = await SubscriptionRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { $set: { status: 'rejected', rejectReason: reason, reviewedBy: req.user._id, reviewedAt: new Date() } },
      { new: true }
    ).lean();
    if (!row) return res.status(409).json({ message: 'This request was already reviewed' });
    await notifyUser(row.user, {
      title: 'Plan request not approved',
      body: `${row.planName}: ${reason}`,
      icon: 'alert-circle-outline',
    });
    await recordAudit(req, {
      action: 'subscription.reject',
      targetType: 'user',
      targetId: row.user,
      summary: `Rejected ${row.planName} request (${row.reference}): ${reason}`,
      meta: { requestId: String(row._id) },
    });
    res.json({ request: presentRequest(row) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  activatePlan,
  presentRequest,
  presentSubscription,
  paidTotals,
  sellerAccountType,
  planFitsAccount,
  listPlans,
  getQuota,
  getMine,
  createRequest,
  cancelRequest,
  listPayments,
  adminListPlans,
  adminCreatePlan,
  adminUpdatePlan,
  adminDeletePlan,
  adminSavePayment,
  adminListRequests,
  adminApprove,
  adminReject,
};
