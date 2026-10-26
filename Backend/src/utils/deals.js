const Chat = require('../models/Chat');
const Listing = require('../models/Listing');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendUserPush } = require('./callPush');
const { recordShopSale } = require('./shopAnalytics');
const listingQueryCache = require('./listingQueryCache');
const { detectChatIntent } = require('./chatIntent');
const { scheduleJob } = require('./jobLock');
const { statusChange } = require('./listing');

/**
 * Deal lifecycle on a chat, detected from behaviour instead of buttons:
 *   meetup confirmed            → scheduled
 *   buyer says "got it"         → completed (chat_signal)
 *   seller marks listing sold   → completed for the latest scheduled buyer (seller_sold)
 *   seller said "sold" + 72h    → completed (auto_signals)
 *   48h with no signal          → one optional "Did you get it?" prompt to the buyer
 *   10 days with nothing        → lapsed
 * Completing a deal sells a single item, or takes one unit off a stock listing.
 */

const HOUR = 60 * 60 * 1000;
const MIN_CHAT_AGE_MS = 10 * 60 * 1000;
const GOT_WORD_DELAY_MS = HOUR;

const id = (value) => String(value?._id || value || '');

function sellerIdOf(listing) {
  return id(listing?.seller);
}

function buyerIdOf(chat, listing) {
  if (chat.buyer) return id(chat.buyer);
  const seller = sellerIdOf(listing);
  const other = (chat.participants || []).find((p) => id(p) !== seller);
  return other ? id(other) : '';
}

function kindOf(listing) {
  if (listing.listingKind) return listing.listingKind;
  return listing.sellerType === 'shop' ? 'stock' : 'single';
}

async function notify(userId, fields) {
  try {
    const note = await Notification.create({ user: userId, type: 'system', ...fields });
    sendUserPush({
      userId,
      title: note.title,
      body: note.body,
      data: {
        type: note.type,
        notificationId: String(note._id),
        route: note.route || '',
        ...(note.params?.chatId ? { chatId: String(note.params.chatId) } : {}),
      },
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}

function reviewParams(listing) {
  return {
    listing: {
      id: id(listing),
      title: listing.title,
      photos: (listing.photos || []).slice(0, 1),
      sellerType: listing.sellerType,
      shopId: listing.shopId ? id(listing.shopId) : null,
    },
    seller: { id: sellerIdOf(listing) },
  };
}

/** Applies the sale to the listing. `alreadySold` = seller marked it sold (counters done there). */
async function applySale(listing, { alreadySold = false, source = '' } = {}) {
  if (alreadySold) return;
  const kind = kindOf(listing);
  if (kind === 'always') {
    await User.updateOne({ _id: listing.seller }, { $inc: { soldCount: 1 } });
  } else if (kind === 'stock' && !listing.hasVariants && Number(listing.stock) > 1) {
    await Listing.updateOne({ _id: listing._id, stock: { $gt: 1 } }, { $inc: { stock: -1 }, $set: { stockConfirmedAt: new Date() } });
    await User.updateOne({ _id: listing.seller }, { $inc: { soldCount: 1 } });
  } else if (kind === 'stock' && listing.hasVariants) {
    // Which variant sold is unknown; the seller gets a one-tap stock prompt instead.
    await User.updateOne({ _id: listing.seller }, { $inc: { soldCount: 1 } });
    await notify(listing.seller, {
      title: 'Update stock?',
      body: `A buyer completed a deal for "${listing.title}". Update the stock for the variant that sold.`,
      icon: 'cube-outline',
      route: 'MyListings',
      relatedListing: listing._id,
    });
  } else if (listing.status === 'active' || listing.status === 'hidden') {
    const bySeller = source === 'seller_confirmed';
    const updated = await Listing.updateOne(
      { _id: listing._id, status: { $in: ['active', 'hidden'] } },
      {
        $set: {
          status: 'sold',
          soldAt: new Date(),
          ...(bySeller ? {} : { 'trust.autoSoldAt': new Date() }),
          statusChange: statusChange('sold', bySeller ? 'seller' : 'auto', `deal_${source || 'completed'}`),
          ...(kind === 'stock' ? { stock: 0 } : {}),
        },
      }
    );
    if (!updated.modifiedCount) return;
    await User.updateOne({ _id: listing.seller }, { $inc: { soldCount: 1 } });
    if (!bySeller) {
      const why = {
        chat_signal: 'The buyer said they got it in chat.',
        buyer_confirmed: 'The buyer confirmed the deal.',
        auto_signals: 'You said it was sold in chat and the meetup passed.',
      }[source] || 'A deal was completed after your meetup.';
      await notify(listing.seller, {
        title: 'Marked as sold',
        body: `"${listing.title}" was marked sold automatically. ${why} Still have it? Tap "Still available" in My Listings.`,
        icon: 'checkmark-done-outline',
        route: 'MyListings',
        relatedListing: listing._id,
      });
    }
  } else {
    return;
  }
  if (listing.sellerType === 'shop' && listing.shopId) recordShopSale(listing.shopId, listing.price).catch(() => {});
  listingQueryCache.invalidateAll();
}

/** Idempotent: only the first call per chat counts. */
async function completeDeal(chatOrId, source, { alreadySold = false } = {}) {
  // ObjectIds also expose `_id`, so check for a loaded chat by its fields.
  const chat = chatOrId?.participants ? chatOrId : await Chat.findById(chatOrId);
  if (!chat?.listing) return false;
  if (Date.now() - new Date(chat.createdAt).getTime() < MIN_CHAT_AGE_MS) return false;
  const listing = await Listing.findById(chat.listing);
  if (!listing) return false;
  const buyerId = buyerIdOf(chat, listing);
  if (!buyerId || buyerId === sellerIdOf(listing)) return false;

  const now = new Date();
  const won = await Chat.findOneAndUpdate(
    { _id: chat._id, 'deal.state': { $ne: 'completed' } },
    { $set: { buyer: buyerId, 'deal.state': 'completed', 'deal.completedAt': now, 'deal.source': source } },
    { new: true }
  );
  if (!won) return false;

  await applySale(listing, { alreadySold, source });
  await User.updateOne({ _id: buyerId }, { $inc: { boughtCount: 1 } });
  await notify(buyerId, {
    title: 'How was your deal?',
    body: `Rate your experience buying "${listing.title}". It helps other buyers.`,
    icon: 'star-outline',
    route: 'RateReview',
    params: reviewParams(listing),
    relatedChat: chat._id,
    relatedListing: listing._id,
  });
  return true;
}

/** Called when a meetup is confirmed in chat. */
async function scheduleDeal(chat, listing) {
  if (!listing || chat.deal?.state === 'completed') return;
  const buyerId = buyerIdOf(chat, listing);
  await Chat.updateOne(
    { _id: chat._id, 'deal.state': { $ne: 'completed' } },
    {
      $set: {
        ...(buyerId ? { buyer: buyerId } : {}),
        'deal.state': 'scheduled',
        'deal.scheduledAt': new Date(),
        'deal.promptedAt': null,
        'deal.noShowBy': '',
      },
    }
  );
}

/** Reads every chat message for deal and availability signals. Never throws. */
async function noteChatMessage(chat, senderId, text) {
  try {
    if (!chat?.listing || !text) return;
    const intent = detectChatIntent(text);
    const listing = await Listing.findById(chat.listing).select('seller sellerType status title photos shopId listingKind stock hasVariants price');
    if (!listing) return;
    const isSeller = id(senderId) === sellerIdOf(listing);
    const now = new Date();
    const chatSet = {};
    if (!chat.buyer) {
      const buyerId = buyerIdOf(chat, listing);
      if (buyerId) chatSet.buyer = buyerId;
    }

    if (isSeller && intent.sold) {
      chatSet['deal.sellerSoldWordAt'] = now;
      await Listing.updateOne({ _id: listing._id }, { $set: { 'trust.soldWordAt': now } });
    }
    if (isSeller && intent.available) {
      await Listing.updateOne(
        { _id: listing._id },
        { $set: { availabilityConfirmedAt: now, 'trust.soldWordAt': null } }
      );
    }
    const scheduledAt = chat.deal?.scheduledAt ? new Date(chat.deal.scheduledAt).getTime() : 0;
    const gotItCounts = !isSeller && intent.gotIt && chat.deal?.state === 'scheduled' && Date.now() - scheduledAt >= GOT_WORD_DELAY_MS;
    if (!isSeller && intent.gotIt) chatSet['deal.buyerGotWordAt'] = now;
    if (Object.keys(chatSet).length) await Chat.updateOne({ _id: chat._id }, { $set: chatSet });

    if (gotItCounts) await completeDeal(chat._id, 'chat_signal');
  } catch (error) {
    console.error('[deals] noteChatMessage:', error.message);
  }
}

/** Seller marked the listing sold: credit the buyer they most likely met. */
async function onListingMarkedSold(listing) {
  try {
    const chats = await Chat.find({ listing: listing._id, 'deal.state': 'scheduled' }).sort({ 'deal.scheduledAt': -1 }).limit(5);
    if (!chats.length) return;
    const best = chats.find((c) => c.deal?.buyerGotWordAt) || chats[0];
    await completeDeal(best, 'seller_sold', { alreadySold: true });
  } catch (error) {
    console.error('[deals] onListingMarkedSold:', error.message);
  }
}

/** Optional manual fallback from the chat (buyer or seller). */
async function recordDealOutcome(chat, user, outcome) {
  const listing = await Listing.findById(chat.listing).select('seller');
  if (!listing) return { status: 404, body: { message: 'Listing not found' } };
  const isSeller = id(user._id) === sellerIdOf(listing);
  if (outcome === 'completed') {
    const done = await completeDeal(chat, isSeller ? 'seller_confirmed' : 'buyer_confirmed');
    return done || chat.deal?.state === 'completed'
      ? { status: 200, body: { ok: true, state: 'completed' } }
      : { status: 400, body: { message: 'This deal cannot be marked complete yet.', code: 'DEAL_NOT_READY' } };
  }
  if (outcome === 'no_show') {
    if (chat.deal?.state !== 'scheduled') {
      return { status: 400, body: { message: 'Only a scheduled meetup can be marked as a no-show.', code: 'DEAL_NOT_SCHEDULED' } };
    }
    await Chat.updateOne({ _id: chat._id }, { $set: { 'deal.state': 'no_show', 'deal.noShowBy': isSeller ? 'buyer' : 'seller' } });
    return { status: 200, body: { ok: true, state: 'no_show' } };
  }
  return { status: 400, body: { message: 'Unknown outcome', code: 'BAD_OUTCOME' } };
}

async function dealSweep() {
  const now = Date.now();
  const scheduled = await Chat.find({ 'deal.state': 'scheduled', 'deal.scheduledAt': { $lte: new Date(now - 48 * HOUR) } })
    .limit(500)
    .lean();
  for (const chat of scheduled) {
    const age = now - new Date(chat.deal.scheduledAt).getTime();
    if (chat.deal.sellerSoldWordAt && age >= 72 * HOUR) {
      await completeDeal(chat._id, 'auto_signals');
    } else if (age >= 10 * 24 * HOUR) {
      await Chat.updateOne({ _id: chat._id, 'deal.state': 'scheduled' }, { $set: { 'deal.state': 'lapsed' } });
    } else if (!chat.deal.promptedAt) {
      const listing = await Listing.findById(chat.listing).select('seller title').lean();
      const buyerId = listing ? buyerIdOf(chat, listing) : '';
      if (buyerId) {
        await notify(buyerId, {
          title: 'Did you get the item?',
          body: `Let us know how your meetup for "${listing.title}" went.`,
          icon: 'checkmark-circle-outline',
          route: 'Chat',
          params: { chatId: String(chat._id), dealCheck: true },
          relatedChat: chat._id,
        });
      }
      await Chat.updateOne({ _id: chat._id }, { $set: { 'deal.promptedAt': new Date() } });
    }
  }
}

function startDealJobs() {
  scheduleJob('deal-sweep', HOUR, dealSweep, { delayMs: 2 * 60 * 1000 });
}

module.exports = {
  completeDeal,
  scheduleDeal,
  noteChatMessage,
  onListingMarkedSold,
  recordDealOutcome,
  dealSweep,
  startDealJobs,
  kindOf,
};
