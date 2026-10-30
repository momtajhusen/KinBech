const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const { nepalDay } = require('./aiQuota');
const { acquireJobLock, scheduleJob } = require('./jobLock');
const listingQueryCache = require('./listingQueryCache');
const { suggestListingCategory } = require('./aiSuggest');
const {
  ALIASES, JUNK, TYPE_KEYWORDS, hasPhrase, listProductCategories, resolveProductCategory, wordText,
} = require('./productCategory');

/*
 * Daily category check. Once a day (Nepal time, CATEGORY_FIX_TIME, default 03:30) every listing's
 * title and search words are matched against each product category's words; a listing whose
 * category none of its words point to, while one other category clearly fits, is moved there.
 * When no category fits at all, the AI names one from the same text (a new category is created
 * when none of the existing ones is right). Text only: photos are never read.
 */

const MINUTE = 60 * 1000;
const NEPAL_OFFSET_MS = (5 * 60 + 45) * MINUTE;
const DEFAULT_TIME = '03:30';
// The run may start up to this late (server restart, a busy sweep before it).
const RUN_WINDOW_MIN = 60;
const CHECK_EVERY_MS = 10 * MINUTE;
const TITLE_WEIGHT = 3;
const KEYWORD_WEIGHT = 1;
// One word of a category's name ("Men's" in "Men's Clothing") says little about an item on its own.
const NAME_WORD_WEIGHT = 1;
// The best category needs a strong word in the title or two in the search words, and must beat the next one by this much.
const MIN_SCORE = 2;
const MIN_LEAD = 2;
const STATUSES = ['active', 'pending', 'hidden'];
// AI calls one run may make; the rest wait for the next day.
const AI_PER_RUN = 30;
// One run at a time, daily or from the admin panel; the lease ends on its own if a server dies mid-run.
const RUN_LOCK = 'category-fix-running';
const RUN_LOCK_MS = 30 * MINUTE;
const MANUAL_RUN_ID = 'category-fix-manual';
const REPORT_ROWS = 100;

const jobRuns = () => mongoose.connection.db.collection('job_runs');

const releaseRunLock = () => mongoose.connection.db.collection('job_locks').updateOne({ _id: RUN_LOCK }, { $set: { until: null } });

/** Runs `fn` under the run lock; null when another run holds it. */
async function underRunLock(fn) {
  if (!(await acquireJobLock(RUN_LOCK, RUN_LOCK_MS))) return null;
  try {
    return await fn();
  } finally {
    await releaseRunLock();
  }
}

/** Minute of the Nepal day the check runs: CATEGORY_FIX_TIME as "HH:MM" (24 h), else 03:30. */
function runMinute() {
  const match = String(process.env.CATEGORY_FIX_TIME || DEFAULT_TIME).trim().match(/^(\d{1,2}):(\d{2})$/);
  const [hours, minutes] = match ? [Number(match[1]), Number(match[2])] : [3, 30];
  if (hours > 23 || minutes > 59) return 3 * 60 + 30;
  return hours * 60 + minutes;
}

function nepalMinute(now) {
  const shifted = new Date(now.getTime() + NEPAL_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

const folded = (words) => [...new Set(words.map((word) => wordText(word).trim()).filter(Boolean))];

/**
 * Each category's words. Strong: its whole name, the short names that mean it ("phone" for Mobiles) and its item
 * words ("sofa" for Furniture). Weak: single words of its name.
 */
function categoryWords(categories) {
  return categories.map((doc) => {
    const aliases = Object.keys(ALIASES).filter((alias) => ALIASES[alias] === doc.name);
    const strong = folded([doc.name, ...aliases, ...(TYPE_KEYWORDS[doc.name] || [])]);
    const nameWords = doc.name.split(/[\s&,]+/).filter((word) => word.length >= 3 && !JUNK.has(word.toLowerCase()));
    const weak = folded(nameWords).filter((word) => !strong.includes(word));
    return { name: doc.name, strong, weak };
  });
}

/** How well each category fits a listing: a word in the title counts more than one in its search words. */
function scoreListing(listing, vocab) {
  const title = wordText(listing.title);
  const keywords = wordText((listing.searchWords || []).join(' '));
  return vocab.map(({ name, strong, weak }) => {
    let score = 0;
    strong.forEach((word) => {
      // A longer phrase ("phone cover") is surer than one word.
      const size = word.split(' ').length;
      if (hasPhrase(title, word)) score += TITLE_WEIGHT * size;
      else if (hasPhrase(keywords, word)) score += KEYWORD_WEIGHT * size;
    });
    weak.forEach((word) => {
      if (hasPhrase(title, word)) score += NAME_WORD_WEIGHT;
    });
    return { name, score };
  }).sort((a, b) => b.score - a.score);
}

/**
 * What to do with `listing`: `{ to }` to move it to a category that clearly fits, `{ ask: true }` when no category
 * fits at all (the AI names one), or null to leave it.
 */
function decide(listing, vocab) {
  const fix = listing.categoryFix;
  // Moved before and the seller put it back: their choice stands.
  if (fix?.at && fix.to && listing.category !== fix.to) return null;
  const ranked = scoreListing(listing, vocab);
  // Any word for the current category means the seller's choice may be right.
  const current = ranked.find((row) => row.name === listing.category);
  if (current && current.score > 0) return null;
  const [best, second] = ranked;
  if (!best || best.score < MIN_SCORE) return fix?.aiTitle === listing.title ? null : { ask: true };
  if (best.name === listing.category) return null;
  if (second && best.score - second.score < MIN_LEAD) return null;
  return { to: best.name };
}

/** The category `listing` should move to by its words alone, or null to leave it. */
function betterCategory(listing, vocab) {
  return decide(listing, vocab)?.to || null;
}

/** The AI's category for `listing` (created when new), or null when it could not answer. */
async function aiCategory(listing, names) {
  const name = await suggestListingCategory({ title: listing.title, searchWords: listing.searchWords || [], existing: names });
  if (!name) return null;
  return resolveProductCategory({
    name,
    title: listing.title,
    description: (listing.searchWords || []).join(' '),
    createIfMissing: true,
  });
}

/** Checks every listing once; `dryRun` only reports the moves. */
async function fixListingCategories({ dryRun = false, aiLimit = AI_PER_RUN } = {}) {
  let categories = await listProductCategories();
  let vocab = categoryWords(categories);
  let checked = 0;
  let aiLeft = dryRun ? 0 : aiLimit;
  const moved = [];
  const created = [];
  const cursor = Listing.find({ status: { $in: STATUSES } })
    .select('title searchWords category categoryFix')
    .lean()
    .cursor({ batchSize: 500 });
  for await (const listing of cursor) {
    checked += 1;
    const decision = decide(listing, vocab);
    if (!decision) continue;
    let to = decision.to;
    let viaAi = false;
    if (decision.ask) {
      if (aiLeft <= 0) continue;
      aiLeft -= 1;
      const resolved = await aiCategory(listing, categories.map((doc) => doc.name)).catch((error) => {
        console.warn(`[category-fix] AI failed for ${listing._id}:`, error.message);
        // AI turned off or no account: no point asking again this run.
        if (error.status === 503) aiLeft = 0;
        return undefined;
      });
      if (resolved === undefined) continue;
      // Asked once per title, whatever it said.
      await Listing.updateOne({ _id: listing._id }, { $set: { 'categoryFix.aiTitle': listing.title } });
      if (!resolved?.name || resolved.name === listing.category) continue;
      to = resolved.name;
      viaAi = true;
      if (resolved.created) {
        created.push(resolved.name);
        categories = await listProductCategories();
        vocab = categoryWords(categories);
      }
    }
    moved.push({ id: String(listing._id), title: listing.title, from: listing.category, to, ai: viaAi });
    if (dryRun) continue;
    await Listing.updateOne(
      { _id: listing._id, category: listing.category },
      {
        $set: {
          category: to,
          'categoryFix.from': listing.category,
          'categoryFix.to': to,
          'categoryFix.at': new Date(),
        },
      }
    );
  }
  if (moved.length && !dryRun) listingQueryCache.invalidateAll();
  return { checked, moved, created };
}

/** Runs the check when its time of day has come and it has not run yet today. */
async function categoryFixSweep(now = new Date()) {
  const start = runMinute();
  const minute = nepalMinute(now);
  if (minute < start || minute >= start + RUN_WINDOW_MIN) return null;
  const day = nepalDay(now);
  const runs = jobRuns();
  const claimed = await runs.findOneAndUpdate(
    { _id: 'category-fix', day: { $ne: day } },
    { $set: { day, startedAt: now } },
    { upsert: true, returnDocument: 'after' }
  ).catch((error) => (error.code === 11000 ? null : Promise.reject(error)));
  if (!claimed) return null;
  const result = await underRunLock(() => fixListingCategories());
  if (!result) {
    // The admin's run is going; try again on the next check.
    await runs.updateOne({ _id: 'category-fix' }, { $set: { day: '' } });
    return null;
  }
  const { checked, moved, created } = result;
  await runs.updateOne(
    { _id: 'category-fix' },
    { $set: { finishedAt: new Date(), checked, moved: moved.length, created: created.length } }
  );
  console.log(`[category-fix] ${day}: checked ${checked}, moved ${moved.length}, new categories ${created.length}`);
  created.forEach((name) => console.log(`[category-fix] new category "${name}"`));
  moved.forEach((row) => console.log(`[category-fix] "${row.title}" ${row.from} -> ${row.to}${row.ai ? ' (AI)' : ''}`));
  return { checked, moved, created };
}

/** The admin panel's "run now": starts one run in the background; false when a run is already going. */
async function startManualCategoryFix(adminId) {
  if (!(await acquireJobLock(RUN_LOCK, RUN_LOCK_MS))) return false;
  const runs = jobRuns();
  await runs.updateOne(
    { _id: MANUAL_RUN_ID },
    { $set: { running: true, startedAt: new Date(), finishedAt: null, by: String(adminId || ''), error: '' } },
    { upsert: true }
  );
  fixListingCategories()
    .then(async ({ checked, moved, created }) => {
      console.log(`[category-fix] admin run: checked ${checked}, moved ${moved.length}, new categories ${created.length}`);
      await runs.updateOne(
        { _id: MANUAL_RUN_ID },
        {
          $set: {
            running: false, finishedAt: new Date(), checked, movedCount: moved.length,
            moved: moved.slice(0, REPORT_ROWS), created,
          },
        }
      );
    })
    .catch((error) => runs.updateOne(
      { _id: MANUAL_RUN_ID },
      { $set: { running: false, finishedAt: new Date(), error: error.message || 'Category check failed' } }
    ))
    .finally(releaseRunLock);
  return true;
}

/** The last admin run (running or finished) and when the daily run last ran. */
async function categoryFixStatus() {
  const runs = jobRuns();
  const [manual, daily] = await Promise.all([runs.findOne({ _id: MANUAL_RUN_ID }), runs.findOne({ _id: 'category-fix' })]);
  const minute = runMinute();
  return {
    manual: manual ? { ...manual, _id: undefined } : null,
    daily: daily ? { day: daily.day, finishedAt: daily.finishedAt || null, checked: daily.checked, moved: daily.moved, created: daily.created } : null,
    dailyTime: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
  };
}

function startCategoryFixJob() {
  scheduleJob('category-fix', CHECK_EVERY_MS, categoryFixSweep, { delayMs: 3 * MINUTE });
}

module.exports = {
  betterCategory,
  categoryFixStatus,
  categoryFixSweep,
  categoryWords,
  fixListingCategories,
  startCategoryFixJob,
  startManualCategoryFix,
};
