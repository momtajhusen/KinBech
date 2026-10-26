const User = require('../models/User');
const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Review = require('../models/Review');
const Report = require('../models/Report');
const Shop = require('../models/Shop');
const SellerScore = require('../models/SellerScore');
const { getTrustSettings } = require('./listingTrust');
const { scheduleJob } = require('./jobLock');

/**
 * Nightly 0–100 seller score (Platform Trust Plan §7). Parts without data are left out
 * instead of counted as zero, and thin data is pulled toward 50 (Bayesian smoothing).
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NST = (5 * 60 + 45) * 60 * 1000;

const WEIGHTS = {
  individual: { responsiveness: 25, quality: 20, reliability: 20, feedback: 15, activity: 10, verification: 10 },
  shop: { responsiveness: 20, quality: 15, stock: 20, reliability: 10, feedback: 15, activity: 5, verification: 15 },
};

const TIERS = [
  ['top', 85],
  ['trusted', 70],
  ['standard', 50],
  ['watch', 30],
  ['restricted', 0],
];

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const ms = (d) => (d ? new Date(d).getTime() : 0);
const decay = (date) => (Date.now() - ms(date) <= 30 * DAY ? 1 : 0.5);

/** Minutes between a and b that fall in 7am–10pm Nepal time (night replies are not expected). */
function awakeMinutes(a, b) {
  let total = 0;
  let cursor = a + NST;
  const end = b + NST;
  while (cursor < end) {
    const dayStart = Math.floor(cursor / DAY) * DAY;
    const open = dayStart + 7 * HOUR;
    const close = dayStart + 22 * HOUR;
    const from = Math.max(cursor, open);
    const to = Math.min(end, close);
    if (to > from) total += to - from;
    cursor = dayStart + DAY;
  }
  return total / 60000;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function tierFor(score) {
  return TIERS.find(([, min]) => score >= min)[0];
}

async function computeSeller(userId, settings) {
  const since90 = new Date(Date.now() - 90 * DAY);
  const since30 = new Date(Date.now() - 30 * DAY);
  const [user, allListings, shop] = await Promise.all([
    User.findById(userId).select('+activeDays createdAt sellerTypePreference').lean(),
    Listing.find({ seller: userId }).select('status heldAt photos sellerType listingKind trust autoHidden createdAt').lean(),
    Shop.findOne({ owner: userId }).select('isVerified status').lean(),
  ]);
  if (!user) return null;
  const sellerType = allListings.some((l) => l.sellerType === 'shop') || shop ? 'shop' : 'individual';
  const listingIds = allListings.map((l) => l._id);
  const recent = allListings.filter((l) => ms(l.createdAt) >= since90.getTime());

  const [chats, reviews, notFound30, scamConfirmed] = await Promise.all([
    Chat.find({ listing: { $in: listingIds }, createdAt: { $gte: since90 } }).select('participants deal createdAt').lean(),
    Review.find({ seller: userId, status: 'approved' }).select('rating createdAt').lean(),
    Report.countDocuments({ reportedUser: userId, reason: 'not-available', createdAt: { $gte: since30 } }),
    Report.exists({ reportedUser: userId, reason: 'scam', status: 'resolved', createdAt: { $gte: since90 } }),
  ]);
  const buyerChats = chats.filter((c) => (c.participants || []).some((p) => String(p) !== String(userId)));

  // Responsiveness: first buyer message → first seller reply.
  const threads = buyerChats.length
    ? await Message.aggregate([
      { $match: { chat: { $in: buyerChats.map((c) => c._id) }, kind: { $ne: 'call' } } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: '$chat', msgs: { $push: { s: '$sender', t: '$createdAt' } } } },
      { $project: { msgs: { $slice: ['$msgs', 30] } } },
    ])
    : [];
  let asked = 0;
  let replied = 0;
  const replyMins = [];
  for (const thread of threads) {
    const first = thread.msgs.find((m) => String(m.s) !== String(userId));
    if (!first) continue;
    const weight = decay(first.t);
    asked += weight;
    const reply = thread.msgs.find((m) => String(m.s) === String(userId) && ms(m.t) > ms(first.t));
    if (reply && ms(reply.t) - ms(first.t) <= DAY) {
      replied += weight;
      replyMins.push(awakeMinutes(ms(first.t), ms(reply.t)));
    }
  }
  const replyRate = asked ? replied / asked : null;
  const replyMinutes = median(replyMins);
  let responsiveness = null;
  if (asked >= 1) {
    let speed = 30;
    if (replyMinutes != null && replyMinutes <= 60) speed = 100;
    else if (replyMinutes != null && replyMinutes <= 180) speed = 80;
    else if (replyMinutes != null && replyMinutes <= 720) speed = 55;
    responsiveness = 100 * replyRate * 0.6 + speed * 0.4;
  }

  // Listing quality: passed review first time, enough photos.
  let quality = null;
  if (recent.length) {
    const clean = recent.filter((l) => !l.heldAt && l.status !== 'removed').length / recent.length;
    const photos = recent.reduce((sum, l) => sum + (l.photos?.length || 0), 0) / recent.length;
    quality = 100 * (0.7 * clean + 0.3 * Math.min(photos / 3, 1));
  }

  // Stock accuracy (stores).
  let stock = null;
  const stockItems = allListings.filter((l) => l.sellerType === 'shop' && l.status === 'active' && l.listingKind !== 'single');
  if (sellerType === 'shop' && stockItems.length) {
    const ok = stockItems.filter((l) => ['', 'in_stock', 'low_stock'].includes(l.trust?.stockState || '')).length / stockItems.length;
    stock = clamp(100 * ok - notFound30 * 10);
  }

  // Reliability: deals finished vs no-shows and lapses, minus listings hidden as stale.
  let done = 0;
  let missed = 0;
  let dealsCompleted = 0;
  for (const chat of buyerChats) {
    const state = chat.deal?.state;
    const weight = decay(chat.deal?.completedAt || chat.deal?.scheduledAt || chat.createdAt);
    if (state === 'completed') {
      done += weight;
      dealsCompleted += 1;
    } else if (state === 'no_show' && chat.deal.noShowBy === 'seller') missed += weight;
    else if (state === 'lapsed') missed += 0.5 * weight;
  }
  const wrongHide = (l) => ms(l.autoHidden?.restoredAt) && ms(l.autoHidden.restoredAt) - ms(l.autoHidden.at) < 2 * DAY;
  const hides = allListings.filter((l) => ms(l.autoHidden?.at) >= since90.getTime() && !wrongHide(l)).length;
  let reliability = null;
  if (done + missed > 0) reliability = clamp((100 * done) / (done + missed) - hides * 8);
  else if (hides) reliability = clamp(70 - hides * 8);

  // Buyer feedback: Bayesian average of deal-verified reviews (prior 4★ worth 5 reviews).
  let feedback = null;
  if (reviews.length) {
    const weighted = reviews.reduce((acc, r) => ({ n: acc.n + decay(r.createdAt), sum: acc.sum + r.rating * decay(r.createdAt) }), { n: 0, sum: 0 });
    const bayes = (5 * 4 + weighted.sum) / (5 + weighted.n);
    feedback = ((bayes - 1) / 4) * 100;
  }

  const cutoffDay = new Date(Date.now() + NST - 30 * DAY).toISOString().slice(0, 10);
  const activeDays = new Set((user.activeDays || []).filter((d) => d >= cutoffDay)).size;
  const activity = Math.min(activeDays / 20, 1) * 100;

  // Phone is universal, so only store verification counts until individual ID checks exist.
  const verification = sellerType === 'shop' ? (shop?.isVerified ? 100 : 0) : null;

  const parts = { responsiveness, quality, stock, reliability, feedback, activity, verification };
  const weights = WEIGHTS[sellerType];
  let sum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (parts[key] == null) continue;
    sum += parts[key] * weight;
    totalWeight += weight;
  }
  const rawScore = totalWeight ? sum / totalWeight : 50;
  const confidence = Math.min(1, Math.max(dealsCompleted / 5, buyerChats.length / 10));
  let score = 50 + (rawScore - 50) * confidence;

  const reasons = [];
  if (replyRate != null) reasons.push(`Replies to ${Math.round(replyRate * 100)}% of buyers${replyMinutes != null ? `, median ${Math.round(replyMinutes)} min` : ''}`);
  if (dealsCompleted) reasons.push(`${dealsCompleted} deal${dealsCompleted === 1 ? '' : 's'} completed in 90 days`);
  if (missed) reasons.push(`${Math.round(missed * 10) / 10} missed or lapsed meetups`);
  if (hides) reasons.push(`${hides} listing${hides === 1 ? '' : 's'} auto-hidden`);
  if (reviews.length) reasons.push(`${reviews.length} review${reviews.length === 1 ? '' : 's'}`);
  if (notFound30 >= 5) {
    score -= 10;
    reasons.push(`${notFound30} "not available" reports in 30 days`);
  }
  if (scamConfirmed) {
    score = Math.min(score, 20);
    reasons.push('Confirmed scam report');
  }
  if (confidence < 1) reasons.push(`Limited data (${Math.round(confidence * 100)}% confidence)`);

  return {
    sellerType,
    score: Math.round(clamp(score)),
    rawScore: Math.round(rawScore),
    confidence: Math.round(confidence * 100) / 100,
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v == null ? null : Math.round(v)])),
    signals: {
      replyRate: replyRate == null ? null : Math.round(replyRate * 100) / 100,
      replyMinutes: replyMinutes == null ? null : Math.round(replyMinutes),
      dealsCompleted,
      missed: Math.round(missed * 10) / 10,
      reviews: reviews.length,
      activeDays,
      autoHides: hides,
      notFound30,
      chats: buyerChats.length,
    },
    reasons,
    isNew: Date.now() - ms(user.createdAt) < 14 * DAY && dealsCompleted === 0,
  };
}

async function scoreSeller(userId, settings) {
  const result = await computeSeller(userId, settings);
  if (!result) return null;
  const prev = await SellerScore.findOne({ user: userId }).lean();
  const finalScore = prev?.override?.score != null ? prev.override.score : result.score;
  const candidate = result.isNew ? 'new' : tierFor(finalScore);
  // A tier only changes after three nights in the new range.
  let tier = prev?.tier;
  let pendingTier = prev?.pendingTier || '';
  let tierStreak = prev?.tierStreak || 0;
  if (!tier || tier === 'new' || candidate === 'new' || candidate === tier) {
    tier = candidate;
    pendingTier = '';
    tierStreak = 0;
  } else {
    tierStreak = pendingTier === candidate ? tierStreak + 1 : 1;
    pendingTier = candidate;
    if (tierStreak >= 3) {
      tier = candidate;
      pendingTier = '';
      tierStreak = 0;
    }
  }

  await SellerScore.updateOne(
    { user: userId },
    {
      $set: {
        sellerType: result.sellerType,
        score: finalScore,
        rawScore: result.rawScore,
        confidence: result.confidence,
        tier,
        pendingTier,
        tierStreak,
        parts: result.parts,
        signals: result.signals,
        reasons: result.reasons,
        computedAt: new Date(),
      },
    },
    { upsert: true }
  );
  const rankBoost = settings.sellerScoreInRanking ? clamp(Math.round((finalScore - 50) * 0.6), -20, 30) : 0;
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        trustScore: finalScore,
        trustTier: tier,
        rankBoost,
        replyMinutes: result.signals.replyMinutes,
        replyRate: result.signals.replyRate,
        dealsCompleted: result.signals.dealsCompleted,
      },
    }
  );
  return { ...result, score: finalScore, tier };
}

async function scoreAllSellers() {
  const settings = await getTrustSettings();
  const sellers = await Listing.distinct('seller', { status: { $in: ['active', 'hidden', 'sold', 'pending'] } });
  let count = 0;
  for (const sellerId of sellers) {
    try {
      await scoreSeller(sellerId, settings);
      count += 1;
    } catch (error) {
      console.error('[sellerScore]', String(sellerId), error.message);
    }
  }
  console.log(`[sellerScore] scored ${count} seller(s)`);
  return count;
}

async function nightlyScore() {
  const last = await SellerScore.findOne().sort({ computedAt: -1 }).select('computedAt').lean();
  const hourNst = new Date(Date.now() + NST).getUTCHours();
  const due = !last || (Date.now() - ms(last.computedAt) > 20 * HOUR && hourNst >= 1 && hourNst < 5);
  if (due) await scoreAllSellers();
}

function startSellerScoreJob() {
  scheduleJob('seller-score', HOUR, nightlyScore, { delayMs: 4 * 60 * 1000 });
}

module.exports = { computeSeller, scoreSeller, scoreAllSellers, startSellerScoreJob, awakeMinutes, tierFor };
