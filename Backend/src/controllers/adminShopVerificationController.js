const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const Listing = require('../models/Listing');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { withViewUrls } = require('../utils/privateMedia');
const { maskValue, openField } = require('../utils/fieldCrypto');
const { hasVerificationMaterial } = require('../utils/shopVerification');
const { recordAudit } = require('../utils/audit');

const CHECK_KEYS = ['panValid', 'nameMatches', 'documentClear', 'addressMatches', 'phoneReachable'];
const STATUSES = ['pending', 'approved', 'rejected', 'none'];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readChecklist(raw, current = {}) {
  const out = {};
  for (const key of CHECK_KEYS) {
    out[key] = raw && raw[key] !== undefined ? Boolean(raw[key]) : Boolean(current?.[key]);
  }
  return out;
}

function presentShop(shop, { listings = 0, reports = 0 } = {}) {
  const owner = shop.owner && shop.owner._id ? shop.owner : null;
  return {
    id: String(shop._id),
    name: shop.name,
    logo: shop.logo || '',
    category: shop.category || '',
    location: shop.location || '',
    address: shop.address || '',
    phone: shop.phone || '',
    status: shop.status,
    isVerified: Boolean(shop.isVerified),
    createdAt: shop.createdAt,
    owner: owner
      ? {
        id: String(owner._id),
        name: owner.name || '',
        phone: owner.phone || '',
        status: owner.status,
        joinedAt: owner.createdAt,
        strikes: (owner.strikes || []).length,
        trustTier: owner.trustTier || 'new',
      }
      : null,
    panMasked: maskValue(shop.panNumber),
    vatMasked: maskValue(shop.vatNumber),
    hasTaxId: Boolean(openField(shop.panNumber) || openField(shop.vatNumber)),
    documents: withViewUrls(shop.businessDocuments || []),
    verificationStatus: shop.verificationStatus || 'none',
    verificationNotes: shop.verificationNotes || '',
    submittedAt: shop.verificationSubmittedAt || null,
    reviewedAt: shop.verificationReviewedAt || null,
    checklist: readChecklist(null, shop.verificationChecklist),
    history: (shop.verificationHistory || [])
      .slice(-15)
      .reverse()
      .map((row) => ({ action: row.action, byName: row.byName || '', note: row.note || '', at: row.at })),
    activeListings: listings,
    ownerReports: reports,
  };
}

/** Review queue: pending shops oldest-first so nobody waits forever. */
async function getVerificationQueue(req, res, next) {
  try {
    const status = STATUSES.includes(req.query.status) || req.query.status === 'all' ? req.query.status : 'pending';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const filter = status === 'all' ? { verificationStatus: { $ne: 'none' } } : { verificationStatus: status };

    const search = String(req.query.q || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: re }, { location: re }, { phone: re }];
    }

    const sort = status === 'pending'
      ? { verificationSubmittedAt: 1, createdAt: 1 }
      : { verificationReviewedAt: -1, updatedAt: -1 };

    const [total, shops, countRows] = await Promise.all([
      Shop.countDocuments(filter),
      Shop.find(filter)
        .populate('owner', 'name phone status createdAt strikes trustTier')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Shop.aggregate([{ $group: { _id: '$verificationStatus', count: { $sum: 1 } } }]),
    ]);

    const shopIds = shops.map((s) => s._id);
    const ownerIds = shops.map((s) => s.owner?._id).filter(Boolean);
    const [listingRows, reportRows] = await Promise.all([
      Listing.aggregate([
        { $match: { shopId: { $in: shopIds }, status: 'active' } },
        { $group: { _id: '$shopId', count: { $sum: 1 } } },
      ]),
      Report.aggregate([
        { $match: { reportedUser: { $in: ownerIds } } },
        { $group: { _id: '$reportedUser', count: { $sum: 1 } } },
      ]),
    ]);
    const listingMap = new Map(listingRows.map((r) => [String(r._id), r.count]));
    const reportMap = new Map(reportRows.map((r) => [String(r._id), r.count]));
    const counts = Object.fromEntries(countRows.map((r) => [r._id || 'none', r.count]));

    res.json({
      shops: shops.map((shop) => presentShop(shop, {
        listings: listingMap.get(String(shop._id)) || 0,
        reports: reportMap.get(String(shop.owner?._id)) || 0,
      })),
      counts: { pending: counts.pending || 0, approved: counts.approved || 0, rejected: counts.rejected || 0 },
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
}

const DECISION_COPY = {
  approve: { title: 'Your shop is verified', icon: 'shield-checkmark-outline' },
  reject: { title: 'Shop verification needs changes', icon: 'alert-circle-outline' },
  revoke: { title: 'Shop verification removed', icon: 'alert-circle-outline' },
};

/**
 * decision: save (checklist/note only) | approve | reject | revoke.
 * Reject and revoke need a reason; it is shown to the owner in the app.
 */
async function decideVerification(req, res, next) {
  try {
    const { shopId } = req.params;
    if (!mongoose.isValidObjectId(shopId)) return res.status(400).json({ message: 'Invalid shop' });
    const decision = String(req.body.decision || '');
    if (!['save', 'approve', 'reject', 'revoke'].includes(decision)) {
      return res.status(400).json({ message: 'Unknown decision' });
    }
    const note = String(req.body.note || '').trim().slice(0, 500);
    const reason = String(req.body.reason || '').trim().slice(0, 300);

    const shop = await Shop.findById(shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const checklist = readChecklist(req.body.checklist, shop.verificationChecklist);
    shop.verificationChecklist = checklist;
    const byName = req.user.name || req.user.email || 'Admin';

    if (decision === 'approve') {
      if (!hasVerificationMaterial(shop)) {
        return res.status(400).json({ message: 'This shop has no PAN/VAT or documents to verify' });
      }
      if (!checklist.nameMatches || !(checklist.panValid || checklist.documentClear)) {
        return res.status(400).json({ message: 'Tick "Name matches" and either "PAN/VAT valid" or "Document clear" before approving' });
      }
      shop.isVerified = true;
      shop.verificationStatus = 'approved';
      shop.verificationNotes = '';
    } else if (decision === 'reject' || decision === 'revoke') {
      if (!reason) return res.status(400).json({ message: 'Reason is required' });
      if (decision === 'revoke' && shop.verificationStatus !== 'approved') {
        return res.status(400).json({ message: 'Only verified shops can be revoked' });
      }
      shop.isVerified = false;
      shop.verificationStatus = 'rejected';
      shop.verificationNotes = reason;
    } else if (!note && !req.body.checklist) {
      return res.status(400).json({ message: 'Nothing to save' });
    }

    if (decision !== 'save') {
      shop.verificationReviewedAt = new Date();
      shop.verificationReviewedBy = req.user._id;
    }
    const historyAction = { save: 'note', approve: 'approved', reject: 'rejected', revoke: 'revoked' }[decision];
    if (decision !== 'save' || note) {
      shop.verificationHistory.push({
        action: historyAction,
        by: req.user._id,
        byName,
        note: [reason, note].filter(Boolean).join(' · '),
      });
    }
    await shop.save();

    if (DECISION_COPY[decision] && shop.owner) {
      const copy = DECISION_COPY[decision];
      await Notification.create({
        user: shop.owner,
        type: 'system',
        title: copy.title,
        body: decision === 'approve'
          ? `${shop.name} now shows the verified badge.`
          : `${shop.name}: ${reason} Update your details from Edit shop to submit again.`,
        icon: copy.icon,
      }).catch(() => {});
    }

    recordAudit(req, {
      action: `shops.verification.${decision}`,
      targetType: 'shop',
      targetId: shop._id,
      summary: `${{ save: 'Saved review notes for', approve: 'Verified', reject: 'Rejected verification of', revoke: 'Revoked verification of' }[decision]} ${shop.name}${reason ? `: ${reason}` : ''}`,
      meta: { checklist, status: shop.verificationStatus },
    });

    await shop.populate('owner', 'name phone status createdAt strikes trustTier');
    res.json({ shop: presentShop(shop.toObject()) });
  } catch (error) {
    next(error);
  }
}

module.exports = { getVerificationQueue, decideVerification };
