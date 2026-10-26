const mongoose = require('mongoose');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const SellerScore = require('../models/SellerScore');
const Session = require('../models/Session');
const MediaHash = require('../models/MediaHash');
const PlatformSettings = require('../models/PlatformSettings');
const { DEFAULT_TRUST, getTrustSettings, clearTrustSettingsCache } = require('../utils/listingTrust');
const { scoreSeller, scoreAllSellers } = require('../utils/sellerScore');
const { recordAudit } = require('../utils/audit');
const listingQueryCache = require('../utils/listingQueryCache');
const { applyStrike } = require('../utils/strikes');

const DAY = 24 * 60 * 60 * 1000;
const NUMBER_KEYS = Object.keys(DEFAULT_TRUST).filter((k) => typeof DEFAULT_TRUST[k] === 'number');
const BOOL_KEYS = Object.keys(DEFAULT_TRUST).filter((k) => typeof DEFAULT_TRUST[k] === 'boolean');

async function getSettings(req, res, next) {
  try {
    res.json({ settings: await getTrustSettings(), defaults: DEFAULT_TRUST });
  } catch (error) {
    next(error);
  }
}

async function saveSettings(req, res, next) {
  try {
    const input = req.body || {};
    const next_ = {};
    for (const key of NUMBER_KEYS) {
      if (input[key] === undefined) continue;
      const value = Number(input[key]);
      if (!Number.isFinite(value) || value < 0 || value > 1000) {
        return res.status(400).json({ message: `${key} must be a number from 0 to 1000` });
      }
      next_[key] = value;
    }
    for (const key of BOOL_KEYS) {
      if (input[key] !== undefined) next_[key] = Boolean(input[key]);
    }
    if (input.points && typeof input.points === 'object') {
      next_.points = {};
      for (const key of Object.keys(DEFAULT_TRUST.points)) {
        if (input.points[key] === undefined) continue;
        const value = Number(input.points[key]);
        if (!Number.isFinite(value) || Math.abs(value) > 100) {
          return res.status(400).json({ message: `points.${key} must be between -100 and 100` });
        }
        next_.points[key] = value;
      }
    }
    const current = await getTrustSettings();
    const merged = { ...current, ...next_, points: { ...current.points, ...(next_.points || {}) } };
    if (!(merged.promptAt <= merged.rankDownAt && merged.rankDownAt <= merged.hideAt)) {
      return res.status(400).json({ message: 'Keep "ask seller" ≤ "rank down" ≤ "auto-hide"' });
    }
    await PlatformSettings.updateOne({ key: 'platform' }, { $set: { key: 'platform', trust: merged } }, { upsert: true });
    clearTrustSettingsCache();
    const rankingToggled = current.sellerScoreInRanking !== merged.sellerScoreInRanking;
    if (rankingToggled) {
      // Apply or remove score boosts now instead of waiting for tonight's run.
      if (merged.sellerScoreInRanking) scoreAllSellers().then(() => listingQueryCache.invalidateAll()).catch(() => {});
      else await User.updateMany({ rankBoost: { $ne: 0 } }, { $set: { rankBoost: 0 } });
      listingQueryCache.invalidateAll();
    }
    res.json({ settings: merged });
  } catch (error) {
    next(error);
  }
}

async function listSellers(req, res, next) {
  try {
    const { tier, type, q } = req.query;
    const sort = req.query.sort === 'low' ? 1 : -1;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = {};
    if (tier && tier !== 'all') filter.tier = tier;
    if (type === 'individual' || type === 'shop') filter.sellerType = type;
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await User.find({ $or: [{ name: rx }, { phone: rx }] }).select('_id').limit(200).lean();
      filter.user = { $in: users.map((u) => u._id) };
    }
    const [rows, total, tiers] = await Promise.all([
      SellerScore.find(filter)
        .sort({ score: sort, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'name phone avatarUrl status createdAt strikes')
        .lean(),
      SellerScore.countDocuments(filter),
      SellerScore.aggregate([{ $group: { _id: '$tier', count: { $sum: 1 } } }]),
    ]);
    const shops = await Shop.find({ owner: { $in: rows.map((r) => r.user?._id).filter(Boolean) } }).select('owner name isVerified').lean();
    const shopOf = new Map(shops.map((s) => [String(s.owner), s]));
    res.json({
      sellers: rows.map((r) => ({
        id: r.user?._id || r.user,
        name: r.user?.name || 'Deleted user',
        phone: r.user?.phone || '',
        avatarUrl: r.user?.avatarUrl || '',
        status: r.user?.status || '',
        strikes: (r.user?.strikes || []).length,
        shop: shopOf.get(String(r.user?._id)) || null,
        sellerType: r.sellerType,
        score: r.score,
        rawScore: r.rawScore,
        confidence: r.confidence,
        tier: r.tier,
        pendingTier: r.pendingTier,
        parts: r.parts,
        signals: r.signals,
        reasons: r.reasons,
        override: r.override?.score != null ? r.override : null,
        computedAt: r.computedAt,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      tiers: Object.fromEntries(tiers.map((t) => [t._id, t.count])),
    });
  } catch (error) {
    next(error);
  }
}

async function overrideScore(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid user id' });
    const note = String(req.body?.note || '').trim().slice(0, 300);
    const clear = req.body?.score === null || req.body?.score === '';
    const score = Number(req.body?.score);
    if (!clear && (!Number.isFinite(score) || score < 0 || score > 100)) {
      return res.status(400).json({ message: 'Score must be 0–100, or empty to clear the override' });
    }
    if (!clear && !note) return res.status(400).json({ message: 'Add a note explaining the override' });
    await SellerScore.updateOne(
      { user: userId },
      { $set: { override: clear ? { score: null, by: null, note: '', at: null } : { score: Math.round(score), by: req.user._id, note, at: new Date() } } },
      { upsert: true }
    );
    const result = await scoreSeller(userId, await getTrustSettings());
    await recordAudit(req, {
      action: clear ? 'trust.score.override.clear' : 'trust.score.override',
      targetType: 'user',
      targetId: userId,
      summary: clear ? 'Override cleared' : `Score set to ${Math.round(score)}: ${note}`,
    });
    res.json({ score: result?.score ?? null, tier: result?.tier ?? null });
  } catch (error) {
    next(error);
  }
}

async function recompute(req, res, next) {
  try {
    if (req.params.userId) {
      const result = await scoreSeller(req.params.userId, await getTrustSettings());
      return res.json({ result });
    }
    const count = await scoreAllSellers();
    res.json({ count });
  } catch (error) {
    next(error);
  }
}

/** Strike ladder: 1 = warning, 2 = 7-day suspension, 3 = permanent suspension. */
async function addStrike(req, res, next) {
  try {
    const { userId } = req.params;
    const reason = String(req.body?.reason || '').trim().slice(0, 300);
    if (!reason) return res.status(400).json({ message: 'Reason is required' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role && user.role !== 'user') return res.status(403).json({ message: 'Admins cannot receive strikes' });
    const { count, action } = await applyStrike(user, reason, req.user._id);
    await recordAudit(req, { action: 'trust.strike.add', targetType: 'user', targetId: userId, summary: `Strike ${count} (${action}): ${reason}` });
    res.json({ strikes: count, action, suspendedUntil: user.suspendedUntil || null });
  } catch (error) {
    next(error);
  }
}

async function stockView(req, res, next) {
  try {
    const state = ['out_of_stock', 'unconfirmed', 'under_check', 'low_stock'].includes(req.query.state) ? req.query.state : null;
    const filter = { sellerType: 'shop', status: { $in: ['active', 'hidden'] } };
    filter['trust.stockState'] = state || { $in: ['out_of_stock', 'unconfirmed', 'under_check'] };
    const [listings, byShop, counts] = await Promise.all([
      Listing.find(filter)
        .sort({ updatedAt: -1 })
        .limit(100)
        .populate('shopId', 'name')
        .select('title stock status trust stockConfirmedAt shopId photos autoHidden')
        .lean(),
      Listing.aggregate([
        { $match: { sellerType: 'shop', status: 'active', listingKind: { $ne: 'single' } } },
        {
          $group: {
            _id: '$shopId',
            total: { $sum: 1 },
            bad: { $sum: { $cond: [{ $in: ['$trust.stockState', ['out_of_stock', 'unconfirmed', 'under_check']] }, 1, 0] } },
          },
        },
        { $match: { bad: { $gt: 0 } } },
        { $sort: { bad: -1 } },
        { $limit: 20 },
        { $lookup: { from: 'shops', localField: '_id', foreignField: '_id', as: 'shop' } },
      ]),
      Listing.aggregate([
        { $match: { sellerType: 'shop', status: 'active' } },
        { $group: { _id: '$trust.stockState', count: { $sum: 1 } } },
      ]),
    ]);
    res.json({
      listings: listings.map((l) => ({
        id: l._id,
        title: l.title,
        photo: l.photos?.[0] || '',
        stock: l.stock,
        status: l.status,
        stockState: l.trust?.stockState || '',
        stockConfirmedAt: l.stockConfirmedAt,
        shop: l.shopId ? { id: l.shopId._id, name: l.shopId.name } : null,
        hiddenReason: l.status === 'hidden' ? l.autoHidden?.reason || '' : '',
      })),
      worstShops: byShop.map((s) => ({
        id: s._id,
        name: s.shop?.[0]?.name || 'Shop',
        total: s.total,
        bad: s.bad,
        accuracy: Math.round(100 * (1 - s.bad / s.total)),
      })),
      counts: Object.fromEntries(counts.map((c) => [c._id || 'unknown', c.count])),
    });
  } catch (error) {
    next(error);
  }
}

async function autoHideReport(req, res, next) {
  try {
    const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * DAY);
    const [byReason, recent] = await Promise.all([
      Listing.aggregate([
        { $match: { 'autoHidden.at': { $gte: since } } },
        {
          $group: {
            _id: '$autoHidden.reason',
            hidden: { $sum: 1 },
            restored: { $sum: { $cond: [{ $ne: ['$autoHidden.restoredAt', null] }, 1, 0] } },
            stillHidden: { $sum: { $cond: [{ $eq: ['$status', 'hidden'] }, 1, 0] } },
          },
        },
        { $sort: { hidden: -1 } },
      ]),
      Listing.find({ 'autoHidden.at': { $gte: since } })
        .sort({ 'autoHidden.at': -1 })
        .limit(50)
        .populate('seller', 'name phone')
        .select('title status autoHidden trust.reasons trust.soldLikelihood seller sellerType')
        .lean(),
    ]);
    const hidden = byReason.reduce((sum, r) => sum + r.hidden, 0);
    const restored = byReason.reduce((sum, r) => sum + r.restored, 0);
    res.json({
      days,
      hidden,
      restored,
      restoreRate: hidden ? Math.round((restored / hidden) * 100) : 0,
      byReason: byReason.map((r) => ({
        reason: r._id || 'unknown',
        hidden: r.hidden,
        restored: r.restored,
        stillHidden: r.stillHidden,
        restoreRate: r.hidden ? Math.round((r.restored / r.hidden) * 100) : 0,
      })),
      recent: recent.map((l) => ({
        id: l._id,
        title: l.title,
        status: l.status,
        sellerType: l.sellerType,
        seller: l.seller ? { id: l.seller._id, name: l.seller.name, phone: l.seller.phone } : null,
        reason: l.autoHidden?.reason || '',
        at: l.autoHidden?.at,
        restoredAt: l.autoHidden?.restoredAt || null,
        soldLikelihood: l.trust?.soldLikelihood || 0,
        signals: l.trust?.reasons || [],
      })),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Accounts that look linked: same IP + device model in the last 30 days, or the same photo.
 * IPs alone are noisy in Nepal (carrier NAT), so device model must match too.
 */
async function fraudClusters(req, res, next) {
  try {
    const since = new Date(Date.now() - 30 * DAY);
    const [devices, photos] = await Promise.all([
      Session.aggregate([
        { $match: { kind: 'app', lastSeenAt: { $gte: since }, deviceName: { $nin: ['', 'Phone'] } } },
        { $project: { user: 1, deviceName: 1, platform: 1, ip: { $ifNull: [{ $cond: [{ $ne: ['$lastIp', ''] }, '$lastIp', '$ip'] }, '$ip'] } } },
        { $match: { ip: { $nin: ['', null] } } },
        { $group: { _id: { ip: '$ip', device: '$deviceName' }, users: { $addToSet: '$user' }, platform: { $first: '$platform' } } },
        { $match: { 'users.1': { $exists: true } } },
        { $project: { ip: '$_id.ip', device: '$_id.device', platform: 1, users: 1, count: { $size: '$users' } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),
      MediaHash.aggregate([
        { $match: { user: { $ne: null } } },
        { $group: { _id: '$hash', users: { $addToSet: '$user' }, files: { $addToSet: '$filename' } } },
        { $match: { 'users.1': { $exists: true } } },
        { $project: { users: 1, file: { $arrayElemAt: ['$files', 0] }, count: { $size: '$users' } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),
    ]);
    const ids = [...new Set([...devices, ...photos].flatMap((g) => g.users.map(String)))];
    const users = await User.find({ _id: { $in: ids } }).select('name phone status createdAt trustTier').lean();
    const userOf = new Map(users.map((u) => [String(u._id), u]));
    const present = (list) => list.map((id) => {
      const u = userOf.get(String(id));
      return u ? { id: u._id, name: u.name, phone: u.phone, status: u.status, tier: u.trustTier, joined: u.createdAt } : { id, name: 'Deleted user' };
    });
    res.json({
      devices: devices.map((g) => ({ ip: g.ip, device: g.device, platform: g.platform, count: g.count, users: present(g.users) })),
      photos: photos.map((g) => ({ hash: g._id, file: g.file, count: g.count, users: present(g.users) })),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  fraudClusters,
  getSettings,
  saveSettings,
  listSellers,
  overrideScore,
  recompute,
  addStrike,
  stockView,
  autoHideReport,
};
