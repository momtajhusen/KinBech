const crypto = require('crypto');
const Chat = require('../models/Chat');
const DigestLog = require('../models/DigestLog');
const Listing = require('../models/Listing');
const Notification = require('../models/Notification');
const User = require('../models/User');
const UserInterest = require('../models/UserInterest');
const Wishlist = require('../models/Wishlist');
const { nepalDay } = require('./aiQuota');
const { sendUserPush } = require('./callPush');
const { scheduleJob } = require('./jobLock');

/*
 * Daily engagement pushes. Four slots in Nepal time; each user gets each slot at their own
 * time (±20 min, different every day). Per slot we pick the single most useful thing for that
 * user — a summary of what they posted today, buyers waiting, views on their items, new items
 * near them, an account to-do — and send at most one push. Caps keep it from becoming noise.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NEPAL_OFFSET_MS = (5 * 60 + 45) * MINUTE;

const SLOTS = [
  { key: 'morning', at: 8 * 60 },
  { key: 'afternoon', at: 13 * 60 },
  { key: 'evening', at: 18 * 60 + 30 },
  { key: 'night', at: 21 * 60 },
];
const JITTER_MIN = 20;
/** A due slot is still sent if the sweep runs up to this late. */
const LATE_WINDOW_MIN = 15;
const DAILY_CAP = 3;
/** Pick something only if it scores at least this, except the night fallback. */
const MIN_SCORE = 40;
const RECENT_PUSH_GAP_MS = 45 * MINUTE;
const ACTIVE_NOW_MS = 15 * MINUTE;
const DORMANT_MS = 21 * DAY;

// Must match DIGEST_CHANNEL_ID in Mobile/src/services/pushAlerts.js.
const DIGEST_CHANNEL = 'kinbech-updates';
// Same tag: a new summary replaces the previous one in the tray instead of stacking.
const DIGEST_TAG = 'kinbech-digest';

const PUBLIC_API = String(
  process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || 'https://kinbechapi.codersalpha.com'
).replace(/\/+$/, '');

function hash(value) {
  return crypto.createHash('md5').update(String(value)).digest().readUInt32BE(0);
}

function nepalMinute(now) {
  const shifted = new Date(now.getTime() + NEPAL_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function nepalDayStart(now) {
  const shifted = new Date(now.getTime() + NEPAL_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - NEPAL_OFFSET_MS
  );
}

/** Minute of the Nepal day this user gets `slot` on `day`. */
function slotMinute(userId, day, slot) {
  return slot.at + (hash(`${userId}|${day}|${slot.key}`) % (JITTER_MIN * 2 + 1)) - JITTER_MIN;
}

function mediaUrl(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${PUBLIC_API}${value.startsWith('/') ? '' : '/'}${value}`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rs(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `Rs ${n.toLocaleString('en-IN')}` : '';
}

function short(text, max = 32) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function cityOf(user) {
  return String(user.location || '').split(',')[0].trim();
}

function firstName(user) {
  return String(user.name || '').trim().split(/\s+/)[0] || '';
}

const cover = (listing) => mediaUrl(listing?.photos?.[0]);

/* ---------- Data the generators share (loaded once per user and slot) ---------- */

async function sellerStats(ctx) {
  if (ctx.stats) return ctx.stats;
  const listings = await Listing.find({ seller: ctx.user._id, status: 'active' })
    .select('title photos views price createdAt')
    .sort({ views: -1 })
    .limit(200)
    .lean();
  const ids = listings.map((l) => l._id);
  const views = listings.reduce((sum, l) => sum + (Number(l.views) || 0), 0);
  const saves = ids.length ? await Wishlist.countDocuments({ listings: { $in: ids } }) : 0;
  const prev = await DigestLog.findOne({ user: ctx.user._id, views: { $ne: null } })
    .sort({ createdAt: -1 })
    .select('views saves')
    .lean();
  ctx.stats = {
    listings,
    views,
    saves,
    viewsDelta: prev ? Math.max(0, views - prev.views) : null,
    savesDelta: prev ? Math.max(0, saves - (prev.saves || 0)) : null,
  };
  return ctx.stats;
}

async function recentlySent(ctx, kind, withinMs) {
  return DigestLog.exists({
    user: ctx.user._id,
    kind,
    sent: true,
    createdAt: { $gte: new Date(ctx.now.getTime() - withinMs) },
  });
}

/* ---------- Generators: each returns one candidate push or null ---------- */

async function postedToday(ctx) {
  const items = await Listing.find({
    seller: ctx.user._id,
    status: { $in: ['active', 'pending'] },
    createdAt: { $gte: nepalDayStart(ctx.now) },
  })
    .select('title photos views price status')
    .sort({ views: -1, createdAt: -1 })
    .lean();
  if (!items.length) return null;
  await sellerStats(ctx);
  const views = items.reduce((sum, i) => sum + (Number(i.views) || 0), 0);
  const saves = await Wishlist.countDocuments({ listings: { $in: items.map((i) => i._id) } });
  const top = items[0];
  const v = { n: items.length, top: short(top.title), price: rs(top.price), views, saves, name: firstName(ctx.user) };
  const names = items.slice(0, 2).map((i) => short(i.title, 22)).join(', ');
  const more = items.length > 2 ? ` +${items.length - 2}` : '';
  const pending = items.filter((i) => i.status === 'pending').length;
  const reach = views
    ? { en: `${plural(views, 'view')}${saves ? ` · ${plural(saves, 'save')}` : ''} so far.`, ne: `अहिलेसम्म ${views} पटक हेरियो${saves ? ` · ${saves} जनाले सेभ गरे` : ''}।` }
    : { en: 'Share it with friends to get the first buyers.', ne: 'पहिलो ग्राहकका लागि साथीहरूलाई सेयर गर्नुहोस्।' };
  const reviewNote = pending
    ? { en: ` ${pending} still in review.`, ne: ` ${pending} वटा जाँचमा छन्।` }
    : { en: '', ne: '' };

  const variants =
    items.length === 1
      ? [
          () => ({ en: [`🎉 Your ${v.top} is live!`, `${v.price} · ${reach.en}${reviewNote.en}`], ne: [`🎉 तपाईंको ${v.top} अब लाइभ छ!`, `${v.price} · ${reach.ne}${reviewNote.ne}`] }),
          () => ({ en: [`📦 Today's post: ${v.top}`, `${reach.en} Tap to see who's interested.${reviewNote.en}`], ne: [`📦 आजको पोस्ट: ${v.top}`, `${reach.ne} को-को इच्छुक छन्, हेर्नुहोस्।${reviewNote.ne}`] }),
          () => ({ en: [`✨ ${v.name ? `${v.name}, your` : 'Your'} item is getting noticed`, `${v.top} · ${reach.en}`], ne: [`✨ तपाईंको सामान देखिन थाल्यो`, `${v.top} · ${reach.ne}`] }),
        ]
      : [
          () => ({ en: [`📦 You posted ${v.n} items today`, `${names}${more} · ${reach.en}${reviewNote.en}`], ne: [`📦 आज तपाईंले ${v.n} वटा सामान राख्नुभयो`, `${names}${more} · ${reach.ne}${reviewNote.ne}`] }),
          () => ({ en: [`🔥 Busy day! ${v.n} new listings from you`, `Most viewed: ${v.top}. ${reach.en}`], ne: [`🔥 व्यस्त दिन! ${v.n} वटा नयाँ पोस्ट`, `सबैभन्दा धेरै हेरिएको: ${v.top}। ${reach.ne}`] }),
          () => ({ en: [`🛍️ Your shelf grew by ${v.n} today`, `${names}${more}. ${reach.en}`], ne: [`🛍️ आज ${v.n} वटा सामान थपियो`, `${names}${more}। ${reach.ne}`] }),
        ];

  return {
    kind: 'posted_today',
    score: 95,
    type: 'listing',
    icon: 'cube-outline',
    image: cover(top),
    route: items.length === 1 ? 'ItemDetail' : 'MyListings',
    params: items.length === 1 ? { listingId: String(top._id) } : {},
    relatedListing: top._id,
    variants,
  };
}

async function waitingBuyers(ctx) {
  const chats = await Chat.find({
    participants: ctx.user._id,
    lastMessageSender: { $nin: [null, ctx.user._id] },
    lastMessageAt: { $gte: new Date(ctx.now.getTime() - 2 * DAY), $lte: new Date(ctx.now.getTime() - 30 * MINUTE) },
  })
    .select('listing lastMessageSender lastMessageAt')
    .sort({ lastMessageAt: -1 })
    .limit(20)
    .populate('listing', 'title photos')
    .populate('lastMessageSender', 'name role')
    .lean()
    .then((rows) => rows.filter((chat) => chat.lastMessageSender?.role === 'user'));
  if (!chats.length) return null;
  const first = chats[0];
  const v = {
    n: chats.length,
    who: firstName(first.lastMessageSender) || 'A buyer',
    item: short(first.listing?.title || 'your item'),
  };
  const variants =
    chats.length === 1
      ? [
          () => ({ en: [`💬 ${v.who} is waiting for your reply`, `About “${v.item}”. Quick replies close deals faster.`], ne: [`💬 ${v.who} तपाईंको जवाफ पर्खिरहेका छन्`, `“${v.item}” बारे। छिटो जवाफले छिटो कारोबार हुन्छ।`] }),
          () => ({ en: [`👋 Don't keep ${v.who} waiting`, `They asked about “${v.item}”. Tap to reply.`], ne: [`👋 ${v.who} लाई पर्खाउनुहुन्न`, `“${v.item}” बारे सोध्नुभएको छ। जवाफ दिनुहोस्।`] }),
        ]
      : [
          () => ({ en: [`💬 ${v.n} people are waiting for your reply`, `${v.who} and others asked about your items. Reply while they're interested.`], ne: [`💬 ${v.n} जना तपाईंको जवाफ पर्खिरहेका छन्`, `${v.who} र अरूले सोधेका छन्। चासो छँदै जवाफ दिनुहोस्।`] }),
          () => ({ en: [`📨 ${v.n} unanswered chats`, `Latest: ${v.who} about “${v.item}”.`], ne: [`📨 ${v.n} वटा च्याटको जवाफ बाँकी`, `पछिल्लो: ${v.who}, “${v.item}” बारे।`] }),
        ];
  return {
    kind: 'waiting_buyers',
    score: 90,
    type: 'chat',
    icon: 'chatbubbles-outline',
    image: cover(first.listing),
    route: chats.length === 1 ? 'Chat' : 'Chats',
    params: chats.length === 1 ? { chatId: String(first._id) } : {},
    variants,
  };
}

async function listingStats(ctx) {
  const stats = await sellerStats(ctx);
  if (!stats.listings.length) return null;
  const growth = stats.viewsDelta;
  if (growth == null ? stats.views < 10 : growth < 5 && !stats.savesDelta) return null;
  const top = stats.listings[0];
  const v = {
    views: growth == null ? stats.views : growth,
    saves: stats.savesDelta || 0,
    top: short(top.title),
    topViews: Number(top.views) || 0,
  };
  const savesLine = v.saves
    ? { en: ` ${plural(v.saves, 'new save')}.`, ne: ` ${v.saves} जनाले नयाँ सेभ गरे।` }
    : { en: ' A fair price closes it faster.', ne: ' उचित मूल्यले छिटो बिक्छ।' };
  const fresh = growth != null;
  const variants = [
    () => ({ en: [`👀 ${plural(v.views, fresh ? 'new view' : 'view')} on your items`, `Top: ${v.top} (${v.topViews}).${savesLine.en}`], ne: [`👀 तपाईंका सामान ${v.views} पटक ${fresh ? 'थप ' : ''}हेरिए`, `सबैभन्दा धेरै: ${v.top} (${v.topViews})।${savesLine.ne}`] }),
    () => ({ en: [`📈 ${v.top} is trending`, `${plural(v.topViews, 'view')} so far.${savesLine.en}`], ne: [`📈 ${v.top} धेरैले हेर्दैछन्`, `अहिलेसम्म ${v.topViews} पटक।${savesLine.ne}`] }),
    () => ({ en: [`🔔 Buyers are checking your listings`, `${plural(v.views, fresh ? 'new view' : 'view')}, led by ${v.top}.${savesLine.en}`], ne: [`🔔 ग्राहकहरू तपाईंका सामान हेर्दैछन्`, `${v.views} पटक, सबैभन्दा धेरै ${v.top}।${savesLine.ne}`] }),
  ];
  return {
    kind: 'listing_stats',
    score: 60,
    type: 'listing',
    icon: 'eye-outline',
    image: cover(top),
    route: 'MyListings',
    params: {},
    relatedListing: top._id,
    variants,
  };
}

async function topCategories(userId) {
  const interest = await UserInterest.findOne({ user: userId }).select('categories').lean();
  return Object.entries(interest?.categories || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
}

async function nearbyNew(ctx) {
  const city = cityOf(ctx.user);
  const since = new Date(ctx.now.getTime() - (ctx.slot.key === 'morning' ? DAY : 12 * HOUR));
  const base = { status: 'active', seller: { $ne: ctx.user._id }, createdAt: { $gte: since } };
  if (city) base.location = new RegExp(escapeRegex(city), 'i');
  const categories = await topCategories(ctx.user._id);
  let filter = categories.length ? { ...base, category: { $in: categories } } : base;
  let count = await Listing.countDocuments(filter).limit(99);
  if (!count && categories.length) {
    filter = base;
    count = await Listing.countDocuments(filter).limit(99);
  }
  if (!count) return null;
  const top = await Listing.findOne({ ...filter, 'photos.0': { $exists: true } })
    .select('title photos price category')
    .sort({ views: -1, createdAt: -1 })
    .lean();
  if (!top) return null;
  const v = {
    n: count,
    city: city || 'you',
    cityNe: city || 'तपाईंको नजिक',
    top: short(top.title),
    price: rs(top.price),
    name: firstName(ctx.user),
    more: count > 1 ? count - 1 : 0,
  };
  const moreEn = v.more ? ` and ${v.more} more` : '';
  const moreNe = v.more ? ` र अरू ${v.more} वटा` : '';
  const variants =
    ctx.slot.key === 'morning'
      ? [
          () => ({ en: [`☀️ Good morning${v.name ? `, ${v.name}` : ''}! ${plural(v.n, 'new item')} near ${v.city}`, `${v.top} · ${v.price}${moreEn}. Have a look before they're gone.`], ne: [`☀️ शुभ प्रभात${v.name ? ` ${v.name}` : ''}! ${v.cityNe}मा ${v.n} नयाँ सामान`, `${v.top} · ${v.price}${moreNe}। बिक्नुअघि हेर्नुहोस्।`] }),
          () => ({ en: [`🌅 Fresh this morning near ${v.city}`, `${v.top} for ${v.price}${moreEn}.`], ne: [`🌅 आज बिहान ${v.cityNe}मा नयाँ`, `${v.top} ${v.price} मा${moreNe}।`] }),
          () => ({ en: [`☕ Your morning picks are here`, `${v.top} · ${v.price}${moreEn}, all near ${v.city}.`], ne: [`☕ बिहानका लागि तपाईंको रोजाइ`, `${v.top} · ${v.price}${moreNe}, सबै ${v.cityNe}मा।`] }),
        ]
      : [
          () => ({ en: [`🔥 Just listed near ${v.city}: ${v.top}`, `${v.price}${moreEn}. Tap to see it first.`], ne: [`🔥 भर्खरै ${v.cityNe}मा: ${v.top}`, `${v.price}${moreNe}। पहिले हेर्नुहोस्।`] }),
          () => ({ en: [`🛒 ${plural(v.n, 'new item')} you might like`, `Starting with ${v.top} at ${v.price}.`], ne: [`🛒 तपाईंलाई मन पर्न सक्ने ${v.n} नयाँ सामान`, `${v.top}, ${v.price} बाट सुरु।`] }),
          () => ({ en: [`👋 New near ${v.city} today`, `${v.top} · ${v.price}${moreEn}.`], ne: [`👋 आज ${v.cityNe}मा नयाँ`, `${v.top} · ${v.price}${moreNe}।`] }),
        ];
  return {
    kind: 'nearby_new',
    score: ctx.slot.key === 'morning' ? 70 : 40,
    type: 'promotion',
    icon: 'sparkles-outline',
    image: cover(top),
    route: count === 1 ? 'ItemDetail' : 'Explore',
    params: count === 1 ? { listingId: String(top._id) } : { category: top.category || '' },
    relatedListing: top._id,
    variants,
  };
}

async function savedStillAvailable(ctx) {
  const wishlist = await Wishlist.findOne({ user: ctx.user._id }).select('listings').lean();
  const ids = wishlist?.listings || [];
  if (!ids.length) return null;
  const items = await Listing.find({ _id: { $in: ids }, status: 'active', seller: { $ne: ctx.user._id } })
    .select('title photos price location')
    .limit(50)
    .lean();
  if (!items.length) return null;
  const item = items[hash(`${ctx.user._id}|${ctx.day}|saved`) % items.length];
  const v = { title: short(item.title), price: rs(item.price), place: short(cityOf(item), 20) };
  const where = v.place ? ` · ${v.place}` : '';
  const variants = [
    () => ({ en: [`❤️ Still available: ${v.title}`, `${v.price}${where}. Message the seller before it's gone.`], ne: [`❤️ अझै उपलब्ध: ${v.title}`, `${v.price}${where}। बिक्नुअघि बिक्रेतालाई सम्पर्क गर्नुहोस्।`] }),
    () => ({ en: [`👀 Still thinking about ${v.title}?`, `It's ${v.price} and still up for grabs.`], ne: [`👀 ${v.title} बारे अझै सोच्दै हुनुहुन्छ?`, `${v.price} मा अझै उपलब्ध छ।`] }),
    () => ({ en: [`⏳ Your saved item is waiting`, `${v.title} · ${v.price}. Ask if it's still available.`], ne: [`⏳ सेभ गरेको सामान पर्खिरहेको छ`, `${v.title} · ${v.price}। उपलब्ध छ कि सोध्नुहोस्।`] }),
  ];
  return {
    kind: 'saved_item',
    score: ctx.slot.key === 'morning' ? 50 : 35,
    type: 'listing',
    icon: 'heart-outline',
    image: cover(item),
    route: 'ItemDetail',
    params: { listingId: String(item._id) },
    relatedListing: item._id,
    variants,
  };
}

async function sellNudge(ctx) {
  const recent = await Listing.exists({ seller: ctx.user._id, createdAt: { $gte: new Date(ctx.now.getTime() - 7 * DAY) } });
  if (recent) return null;
  if (await recentlySent(ctx, 'sell_nudge', 3 * DAY)) return null;
  const seller = (ctx.user.soldCount || 0) > 0 || (await Listing.exists({ seller: ctx.user._id }));
  const city = cityOf(ctx.user);
  const v = { city: city || 'your area', cityNe: city || 'तपाईंको क्षेत्र' };
  const variants = [
    () => ({ en: ['💡 Got something you no longer use?', `Phones, furniture, bikes… post in a minute and meet buyers in ${v.city}.`], ne: ['💡 प्रयोग नगरेको सामान छ?', `फोन, फर्निचर, बाइक… एक मिनेटमै पोस्ट गर्नुहोस्, ${v.cityNe}मै ग्राहक भेट्नुहोस्।`] }),
    () => ({ en: ['💰 Turn clutter into cash this week', `Buyers in ${v.city} are looking. Snap a photo and post.`], ne: ['💰 पुरानो सामानलाई पैसामा बदल्नुहोस्', `${v.cityNe}मा ग्राहक खोज्दैछन्। फोटो खिच्नुहोस् र पोस्ट गर्नुहोस्।`] }),
    () => ({ en: ['📸 One photo, one minute, one new buyer', 'Post something today. No shipping, just meet.'], ne: ['📸 एउटा फोटो, एक मिनेट, नयाँ ग्राहक', 'आज केही पोस्ट गर्नुहोस्। ढुवानी होइन, भेटेरै कारोबार।'] }),
  ];
  return {
    kind: 'sell_nudge',
    score: seller ? 45 : 30,
    type: 'promotion',
    icon: 'add-circle-outline',
    image: '',
    route: 'PostListing',
    params: {},
    variants,
  };
}

async function hiddenOrStale(ctx) {
  if (await recentlySent(ctx, 'listing_care', 3 * DAY)) return null;
  const hidden = await Listing.findOne({ seller: ctx.user._id, status: 'hidden', 'autoHidden.at': { $ne: null } })
    .select('title photos')
    .sort({ 'autoHidden.at': -1 })
    .lean();
  if (hidden) {
    const t = short(hidden.title);
    return {
      kind: 'listing_care',
      score: 75,
      type: 'listing',
      icon: 'refresh-outline',
      image: cover(hidden),
      route: 'MyListings',
      params: {},
      relatedListing: hidden._id,
      variants: [
        () => ({ en: [`♻️ ${t} was hidden`, 'It went quiet for a while. Tap to bring it back to buyers.'], ne: [`♻️ ${t} लुकाइएको छ`, 'केही समय निष्क्रिय भयो। फेरि देखाउन ट्याप गर्नुहोस्।'] }),
        () => ({ en: [`👋 Still selling ${t}?`, "It's hidden right now. One tap puts it back on KinBech."], ne: [`👋 ${t} अझै बेच्दै हुनुहुन्छ?`, 'अहिले लुकेको छ। एक ट्यापमा फेरि देखिन्छ।'] }),
      ],
    };
  }
  const old = new Date(ctx.now.getTime() - 14 * DAY);
  const stale = await Listing.findOne({
    seller: ctx.user._id,
    status: 'active',
    createdAt: { $lte: old },
    $or: [{ availabilityConfirmedAt: null }, { availabilityConfirmedAt: { $lte: old } }],
  })
    .select('title photos')
    .sort({ createdAt: 1 })
    .lean();
  if (!stale) return null;
  const t = short(stale.title);
  return {
    kind: 'listing_care',
    score: 70,
    type: 'listing',
    icon: 'time-outline',
    image: cover(stale),
    route: 'ItemDetail',
    params: { listingId: String(stale._id) },
    relatedListing: stale._id,
    variants: [
      () => ({ en: [`🕒 Is ${t} still available?`, 'Confirm it in one tap — fresh listings rank higher.'], ne: [`🕒 ${t} अझै उपलब्ध छ?`, 'एक ट्यापमा पुष्टि गर्नुहोस् — ताजा पोस्ट माथि देखिन्छ।'] }),
      () => ({ en: [`✏️ Give ${t} a fresh start`, 'Update the price or photos to reach new buyers.'], ne: [`✏️ ${t} लाई नयाँ बनाउनुहोस्`, 'मूल्य वा फोटो अपडेट गरेर नयाँ ग्राहक पाउनुहोस्।'] }),
    ],
  };
}

async function accountTodo(ctx) {
  if (await recentlySent(ctx, 'account_todo', 3 * DAY)) return null;
  const user = ctx.user;
  const hasListings = await Listing.exists({ seller: user._id, status: 'active' });
  let todo = null;
  if (!user.avatarUrl) {
    todo = [
      () => ({ en: ['📸 Add a profile photo', 'Buyers reply faster to a real face. It takes 10 seconds.'], ne: ['📸 प्रोफाइल फोटो राख्नुहोस्', 'वास्तविक अनुहार देखेर ग्राहक छिटो जवाफ दिन्छन्। १० सेकेन्ड लाग्छ।'] }),
      () => ({ en: ['🙂 Your profile is missing a photo', 'A photo builds trust before the meetup.'], ne: ['🙂 तपाईंको प्रोफाइलमा फोटो छैन', 'फोटोले भेट्नुअघि नै भरोसा बढाउँछ।'] }),
    ];
  } else if (!user.location) {
    todo = [
      () => ({ en: ['📍 Set your area', "We'll show items and sellers closest to you first."], ne: ['📍 आफ्नो क्षेत्र राख्नुहोस्', 'तपाईंको नजिकका सामान र बिक्रेता पहिले देखाउँछौं।'] }),
    ];
  } else if (hasListings && !(user.paymentMethods || []).length) {
    todo = [
      () => ({ en: ['💳 Add eSewa, Khalti or bank', 'Let buyers know how they can pay you at the meetup.'], ne: ['💳 eSewa, Khalti वा बैंक थप्नुहोस्', 'भेटमा कसरी तिर्ने भनेर ग्राहकलाई थाहा होस्।'] }),
    ];
  } else if (hasListings && !user.bio) {
    todo = [
      () => ({ en: ['✍️ Add a short bio', 'One line about you helps buyers trust your listings.'], ne: ['✍️ छोटो परिचय लेख्नुहोस्', 'एक लाइनको परिचयले ग्राहकको भरोसा बढाउँछ।'] }),
    ];
  }
  if (!todo) return null;
  return {
    kind: 'account_todo',
    score: 60,
    type: 'system',
    icon: 'person-circle-outline',
    image: '',
    route: 'EditProfile',
    params: {},
    variants: todo,
  };
}

async function planOrCredits(ctx) {
  const user = ctx.user;
  const ends = user.subscription?.endsAt ? new Date(user.subscription.endsAt) : null;
  if (ends && ends > ctx.now && ends - ctx.now < 3 * DAY && !(await recentlySent(ctx, 'plan_ending', 2 * DAY))) {
    const days = Math.max(1, Math.ceil((ends - ctx.now) / DAY));
    const plan = user.subscription.name || 'posting';
    return {
      kind: 'plan_ending',
      score: 80,
      type: 'system',
      icon: 'hourglass-outline',
      image: '',
      route: 'Subscription',
      params: {},
      variants: [
        () => ({ en: [`⏳ Your ${plan} plan ends in ${plural(days, 'day')}`, 'Renew to keep posting without limits.'], ne: [`⏳ तपाईंको ${plan} प्लान ${days} दिनमा सकिन्छ`, 'बिना सीमा पोस्ट गर्न नवीकरण गर्नुहोस्।'] }),
      ],
    };
  }
  const credits = Number(user.featuredCredits) || 0;
  if (credits <= 0 || (await recentlySent(ctx, 'boost_credits', 4 * DAY))) return null;
  const stats = await sellerStats(ctx);
  if (!stats.listings.length) return null;
  const top = stats.listings[0];
  const t = short(top.title);
  return {
    kind: 'boost_credits',
    score: 50,
    type: 'promotion',
    icon: 'rocket-outline',
    image: cover(top),
    route: 'MyListings',
    params: {},
    relatedListing: top._id,
    variants: [
      () => ({ en: [`🚀 You have ${plural(credits, 'free boost day')}`, `Feature ${t} and reach more buyers.`], ne: [`🚀 तपाईंसँग ${credits} दिनको निःशुल्क बुस्ट छ`, `${t} फिचर गरेर धेरै ग्राहकसम्म पुग्नुहोस्।`] }),
      () => ({ en: ['🚀 Unused boost waiting for you', `Put ${t} at the top for free.`], ne: ['🚀 प्रयोग नगरेको बुस्ट बाँकी छ', `${t} लाई निःशुल्क माथि राख्नुहोस्।`] }),
    ],
  };
}

const TIPS = [
  { route: 'Explore', icon: 'map-outline', en: ['🗺️ See who is selling around you', 'Open the map in Explore to find sellers on your street.'], ne: ['🗺️ तपाईंको वरपर को बेच्दैछ हेर्नुहोस्', 'Explore मा नक्सा खोलेर नजिकका बिक्रेता भेट्टाउनुहोस्।'] },
  { route: 'Notifications', icon: 'shield-checkmark-outline', en: ['🛡️ Tonight\'s safety tip', 'Meet in busy public places and check the item before you pay.'], ne: ['🛡️ आजको सुरक्षा सुझाव', 'भीडभाड भएको ठाउँमा भेट्नुहोस्, तिर्नुअघि सामान जाँच्नुहोस्।'] },
  { route: 'Explore', icon: 'pricetag-outline', en: ['🏷️ Deals end fast near you', 'Check what was listed today before someone else does.'], ne: ['🏷️ नजिकका राम्रा सौदा छिटो सकिन्छन्', 'आज के-के आयो, अरूभन्दा पहिले हेर्नुहोस्।'] },
  { route: 'Notifications', icon: 'lock-closed-outline', en: ['🔒 KinBech never asks for your OTP', 'Keep chats in the app and report anyone who asks for codes.'], ne: ['🔒 KinBech ले कहिल्यै OTP माग्दैन', 'कुरा एपमै गर्नुहोस्, कोड माग्नेलाई रिपोर्ट गर्नुहोस्।'] },
  { route: 'Wishlist', icon: 'heart-outline', en: ['❤️ Save items you like', "Tap the heart and we'll remind you while they're still available."], ne: ['❤️ मन परेका सामान सेभ गर्नुहोस्', 'मुटु थिच्नुहोस्, उपलब्ध छँदै सम्झाइदिन्छौं।'] },
  { route: 'PostListing', icon: 'camera-outline', en: ['📸 Good photos sell 2× faster', 'Use daylight and show every side of the item.'], ne: ['📸 राम्रो फोटोले दोब्बर छिटो बिक्छ', 'दिउँसोको उज्यालोमा सबै तर्फबाट फोटो खिच्नुहोस्।'] },
];

async function dailyTip(ctx) {
  const index = hash(`${ctx.user._id}|${ctx.day}|tip`) % TIPS.length;
  const tip = TIPS[index];
  return {
    kind: 'tip',
    score: 15,
    type: 'promotion',
    icon: tip.icon,
    image: '',
    route: tip.route,
    params: {},
    variants: [() => ({ en: tip.en, ne: tip.ne })],
  };
}

const PLAN = {
  morning: [planOrCredits, nearbyNew, savedStillAvailable, dailyTip],
  afternoon: [waitingBuyers, planOrCredits, listingStats, nearbyNew, dailyTip],
  evening: [postedToday, waitingBuyers, listingStats, sellNudge, savedStillAvailable, nearbyNew, dailyTip],
  night: [hiddenOrStale, waitingBuyers, accountTodo, planOrCredits, dailyTip],
};

/* ---------- Picking and sending ---------- */

async function pickCandidate(ctx, { sentKinds, fallback }) {
  const results = [];
  for (const generate of PLAN[ctx.slot.key]) {
    try {
      const candidate = await generate(ctx);
      if (candidate && !sentKinds.has(candidate.kind)) results.push(candidate);
    } catch (error) {
      console.warn(`[digest] ${generate.name} failed for ${ctx.user._id}:`, error.message);
    }
  }
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  if (!best) return null;
  if (best.score < MIN_SCORE && !fallback) return null;
  return best;
}

async function chooseText(ctx, candidate) {
  const last = await DigestLog.findOne({ user: ctx.user._id, kind: candidate.kind, sent: true })
    .sort({ createdAt: -1 })
    .select('template')
    .lean();
  const count = candidate.variants.length;
  let index = hash(`${ctx.user._id}|${ctx.day}|${ctx.slot.key}|${candidate.kind}`) % count;
  if (count > 1 && last && last.template === index) index = (index + 1) % count;
  const text = candidate.variants[index]();
  const [title, body] = ctx.nepali ? text.ne : text.en;
  return { index, title, body };
}

/** Why this user should not get anything in this slot right now, or '' to go ahead. */
async function quietReason(user, now) {
  if (user.lastActiveAt && now - new Date(user.lastActiveAt) < ACTIVE_NOW_MS) return 'active_now';
  const recentPush = await Notification.exists({
    user: user._id,
    pushedAt: { $gte: new Date(now.getTime() - RECENT_PUSH_GAP_MS) },
  });
  return recentPush ? 'recent_push' : '';
}

async function runSlot(user, slot, day, now, { dryRun = false } = {}) {
  if (!dryRun) {
    try {
      await DigestLog.create({ user: user._id, day, slot: slot.key });
    } catch (error) {
      if (error.code === 11000) return { status: 'already' };
      throw error;
    }
  }
  const finish = (fields) =>
    dryRun ? null : DigestLog.updateOne({ user: user._id, day, slot: slot.key }, { $set: fields });

  const reason = await quietReason(user, now);
  if (reason && !dryRun) {
    await finish({ reason });
    return { status: 'skip', reason };
  }

  const today = await DigestLog.find({ user: user._id, day, sent: true }).select('kind').lean();
  if (today.length >= DAILY_CAP) {
    await finish({ reason: 'daily_cap' });
    return { status: 'skip', reason: 'daily_cap' };
  }

  const ctx = { user, slot, day, now, nepali: user.preferences?.language === 'Nepali' };
  const candidate = await pickCandidate(ctx, {
    sentKinds: new Set(today.map((row) => row.kind)),
    // Make sure every opted-in user hears from us once a day, but no more than needed.
    fallback: slot.key === 'night' && !today.length,
  });
  if (!candidate) {
    await finish({ reason: 'nothing_useful' });
    return { status: 'skip', reason: 'nothing_useful' };
  }

  const { index, title, body } = await chooseText(ctx, candidate);
  if (dryRun) return { status: 'preview', kind: candidate.kind, title, body, image: candidate.image, route: candidate.route, params: candidate.params };

  const params = { ...candidate.params, digest: slot.key, ...(candidate.image ? { bigPicture: candidate.image } : {}) };
  const note = await Notification.create({
    user: user._id,
    type: candidate.type,
    title,
    body,
    icon: candidate.icon,
    route: candidate.route,
    params,
    relatedListing: candidate.relatedListing || undefined,
  });
  const sent = await sendUserPush({
    userId: user._id,
    title,
    body,
    image: candidate.image,
    tag: DIGEST_TAG,
    channelId: DIGEST_CHANNEL,
    data: {
      type: candidate.type,
      notificationId: String(note._id),
      route: candidate.route,
      listingId: params.listingId || '',
      chatId: params.chatId || '',
      category: params.category || '',
      bigPicture: candidate.image || '',
      digest: '1',
    },
  });
  await finish({
    kind: candidate.kind,
    template: index,
    notification: note._id,
    sent,
    reason: sent ? '' : 'push_failed',
    ...(ctx.stats ? { views: ctx.stats.views, saves: ctx.stats.saves } : {}),
  });
  return { status: sent ? 'sent' : 'stored', kind: candidate.kind, title, body };
}

const ELIGIBLE = {
  role: 'user',
  status: 'active',
  deletedAt: null,
  deletionScheduledFor: null,
  fcmToken: { $nin: ['', null] },
  'preferences.notifications': { $ne: false },
  'preferences.dailyDigest': { $ne: false },
};

const USER_FIELDS =
  '_id name location avatarUrl bio paymentMethods soldCount featuredCredits subscription preferences lastActiveAt createdAt';

/** Dormant users hear from us on roughly one evening in three, not four times a day. */
function slotAllowed(user, slot, day, now) {
  const last = user.lastActiveAt ? new Date(user.lastActiveAt) : new Date(user.createdAt || now);
  if (now - last < DORMANT_MS) return true;
  return slot.key === 'evening' && hash(`${user._id}|${day}|dormant`) % 3 === 0;
}

async function digestSweep(now = new Date()) {
  const minute = nepalMinute(now);
  const day = nepalDay(now);
  const open = SLOTS.filter((s) => minute >= s.at - JITTER_MIN && minute <= s.at + JITTER_MIN + LATE_WINDOW_MIN);
  if (!open.length) return { processed: 0 };

  let processed = 0;
  let sent = 0;
  const cursor = User.find(ELIGIBLE).select(USER_FIELDS).lean().cursor({ batchSize: 300 });
  for await (const user of cursor) {
    for (const slot of open) {
      const target = slotMinute(user._id, day, slot);
      if (minute < target || minute - target > LATE_WINDOW_MIN) continue;
      if (!slotAllowed(user, slot, day, now)) continue;
      try {
        const result = await runSlot(user, slot, day, now);
        if (result.status !== 'already') processed += 1;
        if (result.status === 'sent') sent += 1;
      } catch (error) {
        console.warn(`[digest] ${slot.key} for ${user._id} failed:`, error.message);
      }
    }
  }
  return { processed, sent };
}

/** What `userId` would get in `slotKey` right now, without saving or pushing anything. */
async function previewDigest(userId, slotKey, now = new Date()) {
  const slot = SLOTS.find((s) => s.key === slotKey) || SLOTS[0];
  const user = await User.findById(userId).select(USER_FIELDS).lean();
  if (!user) return null;
  return runSlot(user, slot, nepalDay(now), now, { dryRun: true });
}

function startDailyDigestJob() {
  scheduleJob('daily-digest', 5 * MINUTE, digestSweep, { delayMs: 2 * MINUTE });
}

module.exports = { startDailyDigestJob, digestSweep, previewDigest, slotMinute, SLOTS };
