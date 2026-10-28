const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const {
  candidateAccounts,
  getAiSettings,
  markAccountBlocked,
  markAccountModelBlocked,
  markModelBlocked,
  modelsForAccount,
  recordUsage,
} = require('./aiSettings');

function isQuotaError(status, payload) {
  if (status !== 429) return false;
  const message = String(payload?.error?.message || '');
  return /quota/i.test(message) || payload?.error?.status === 'RESOURCE_EXHAUSTED';
}

function retryDelayMs(payload) {
  const info = (payload?.error?.details || []).find((item) => item?.retryDelay);
  const fromDetails = info ? parseFloat(String(info.retryDelay)) : NaN;
  if (Number.isFinite(fromDetails)) return fromDetails * 1000;
  const match = String(payload?.error?.message || '').match(/retry in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i);
  if (match) {
    const [, h = 0, m = 0, sec = 0] = match;
    return ((Number(h) * 60 + Number(m)) * 60 + Number(sec)) * 1000;
  }
  return 60 * 60 * 1000;
}

const CONDITIONS = ['New', 'Good', 'Fair'];
const SAFETY_ISSUES = ['nudity', 'violence', 'weapon', 'drugs', 'other'];

const SYSTEM_INSTRUCTION =
  'You analyse product photos for a classifieds marketplace and reply with valid JSON only.';

// Short output + no thinking keeps the round trip fast for an on-screen auto-fill.
const GENERATION_CONFIG = {
  temperature: 0.2,
  maxOutputTokens: 1400,
  responseMimeType: 'application/json',
};

function isKeyError(status, payload) {
  // Quota messages mention "billing" too; those must switch model, not drop the key.
  if (isQuotaError(status, payload)) return false;
  const message = String(payload?.error?.message || '');
  if (status === 401 || status === 403) return true;
  return /api key|permission denied|unregistered|consumer|billing/i.test(message);
}

function buildPrompt(categories, shop) {
  const list = (categories || []).filter(Boolean);
  const shopList = (shop?.categories || []).filter(Boolean);
  const lines = [
    'You are a listing assistant for KinBech, a Nepali buy-and-sell marketplace.',
    'Study the attached product photo carefully before answering.',
    'Read every visible clue: brand, model name or number printed on the item, colour,',
    'material, finish, size, ports and buttons, packaging, accessories in the frame, and',
    'any wear, scratches, dents or missing parts. Zoom into small text or labels when',
    'that helps you identify the exact model.',
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"title": string, "description": string, "category": string, "condition": string, "priceNpr": number, "newPriceNpr": number, "safety": {"allowed": boolean, "issue": string, "reason": string}, "searchWords": string[]}',
    '',
    'Safety rules (check first):',
    '- KinBech is a family marketplace. Set safety.allowed to false when the photo shows nudity,',
    '  sexual or suggestive content, violence, blood or gore, injured people or animals,',
    '  weapons, ammunition, or drugs.',
    '- safety.issue: exactly one of "none", "nudity", "violence", "weapon", "drugs", "other".',
    '- safety.reason: one short plain English sentence saying what is wrong. Empty when allowed.',
    '- When safety.allowed is false, leave title, description and searchWords empty.',
    '',
    'Price rules:',
    '- priceNpr: a realistic selling price in Nepal, in Nepali rupees (NPR), for this exact item',
    '  in the condition you see. Think of current second-hand prices in Nepal for used items and',
    '  Nepal retail prices for new ones. Whole number only, no currency text. Use 0 only if unknown.',
    '- newPriceNpr: the current retail price in Nepal, in NPR, of this exact item bought brand new',
    '  today (same brand and model; nearest current model if it is discontinued). Whole number only.',
    '  Use 0 only if unknown.',
    '',
    'Title rules (most important):',
    '- Choose the single best search title a buyer would type into a search box.',
    '- The title must be exactly 5 words. Never fewer than 5, never more than 5.',
    '- Use only the 5 words that identify this item: brand, model, and the spec buyers search.',
    '- If a detail would make a 6th word, drop the least useful word and keep exactly 5.',
    '- Searchable plain words only. No emojis, no ALL CAPS, no punctuation except a model number.',
    '- Never add filler like "for sale", "urgent", "best price", "good condition", "used", "brand new".',
    '',
    'Description rules:',
    '- Do not stop at a general description. Describe this exact item, then list its features.',
    '- First write 1 or 2 short sentences: what it is, colour, and visible condition.',
    '- Then a line that says exactly "Features:" and 4 to 7 lines, each starting with "- ".',
    '- Every feature must belong to this item: brand, model, material, size, capacity, ports,',
    '  included accessories, and visible wear. Skip a feature you cannot see.',
    '- No price, currency, or "negotiable".',
    '',
    'Search word rules:',
    '- First name the exact item in the photo. searchWords must be names of that item only.',
    '- Do not copy words from any sample list. There is no fixed vocabulary.',
    '- For this item, give the names a buyer in Nepal would type, in four languages:',
    '  English, Hinglish (Roman Hindi), Nepali, and Maithili.',
    '- Nepali and Maithili each need the Roman spelling and the Devanagari spelling as separate strings.',
    '- A Roman word does not replace its Devanagari spelling. Keep both when people search either way.',
    '- Put the most popular local name first, then the other real names and spellings.',
    '- 12 to 20 short strings. One name per string. No language labels, brackets, notes, price, or sentences.',
    '- Skip a word only when it is the same spelling already listed.',
    '- If the photo shows a brand or model, include that exact text plus the local generic names for that kind of product.',
    '- After the names, add a colour or type only when it is visible on this item and buyers would search it.',
    '- condition: exactly one of "New", "Good", "Fair", judged from the visible wear.',
    '- If something is unclear, give your best reasonable guess instead of leaving it empty.',
  ];
  lines.push('');
  lines.push('Category rules (critical — buyers filter by this):');
  lines.push('- Put the same product type in the same category every time.');
  lines.push('- Use a product class, never a brand, model, colour, or condition.');
  lines.push('- Examples of wrong names: "Apple", "iPhone 13", "Gaming Laptop", "Red Sofa".');
  lines.push('- Phone, charger, and phone case or phone cover → Mobiles. MacBook and notebooks → Laptops.');
  lines.push('- Books, novels and textbooks → Books. A book cover is a book, never Mobiles.');
  lines.push('- TV, fan, SSD, power supply, headphones → Electronics.');
  if (shop?.type) {
    lines.push(`- This seller runs a "${shop.type}" store.`);
    if (shopList.length) {
      lines.push(`- Their store categories: ${shopList.map((c) => `"${c}"`).join(', ')}.`);
      lines.push('- Pick one of the store categories whenever the item fits one of them.');
    }
  }
  if (list.length) {
    lines.push(`- Prefer exactly one of: ${list.map((c) => `"${c}"`).join(', ')}.`);
    lines.push('- Invent a new name only if this item is a different product class not covered above.');
    lines.push('- A new name must be 1 to 3 Title Case words, usually plural, e.g. "Books", "Toys & Games".');
  } else {
    lines.push('- category: a short marketplace class name, 1 to 3 Title Case words.');
  }
  return lines.join('\n');
}

function parseSuggestion(rawText) {
  if (!rawText) return null;
  const cleaned = String(rawText)
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const safetyRaw = parsed.safety && typeof parsed.safety === 'object' ? parsed.safety : {};
  const issue = String(safetyRaw.issue || '').trim().toLowerCase();
  const safety = {
    allowed: safetyRaw.allowed !== false && !SAFETY_ISSUES.includes(issue),
    issue: SAFETY_ISSUES.includes(issue) ? issue : safetyRaw.allowed === false ? 'other' : 'none',
    reason: String(safetyRaw.reason || '').trim().slice(0, 240),
  };
  if (!safety.allowed) {
    return { title: '', description: '', category: null, condition: null, priceNpr: null, newPriceNpr: null, searchWords: [], safety };
  }

  const titleWords = String(parsed.title || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const title = (titleWords.length > 5 ? titleWords.slice(0, 5) : titleWords).join(' ');
  const description = String(parsed.description || '').trim();
  if (!title && !description) return null;
  const priceNpr = Math.round(Number(parsed.priceNpr));
  const newPriceNpr = Math.round(Number(parsed.newPriceNpr));

  const conditionRaw = String(parsed.condition || '').trim().toLowerCase();
  const searchWords = Array.isArray(parsed.searchWords)
    ? parsed.searchWords
        .map((word) => String(word || '').trim().replace(/\s+/g, ' ').slice(0, 40))
        .filter(Boolean)
        .filter((word, index, all) => all.findIndex((item) => item.toLowerCase() === word.toLowerCase()) === index)
        .slice(0, 20)
    : [];
  return {
    title: title.slice(0, 120),
    description: description.slice(0, 1600),
    category: String(parsed.category || '').trim() || null,
    condition: CONDITIONS.find((c) => c.toLowerCase() === conditionRaw) || null,
    priceNpr: Number.isFinite(priceNpr) && priceNpr > 0 ? priceNpr : null,
    newPriceNpr: Number.isFinite(newPriceNpr) && newPriceNpr > 0 ? newPriceNpr : null,
    searchWords,
    safety,
  };
}

function buildBody(generationConfig, data, mimeType, categories, shop) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data } },
          { text: buildPrompt(categories, shop) },
        ],
      },
    ],
    generationConfig,
  };
}

const SHOP_CATEGORY_INSTRUCTION =
  'You organise product categories for a classifieds marketplace and reply with valid JSON only.';

function buildShopCategoriesBody(generationConfig, { type, name, description, existing }) {
  const lines = [
    'KinBech is a Nepali local buy-and-sell marketplace.',
    `A seller runs a "${type}" store${name ? ` called "${name}"` : ''}.`,
  ];
  if (description) lines.push(`Store description: ${description}`);
  lines.push(
    '',
    'List the product categories buyers would browse in this store.',
    'Reply with JSON only, in exactly this shape: {"categories": string[]}',
    '- 6 to 10 categories, the most common first.',
    '- Only products this kind of store really sells.',
    '- Each one is a product class of 1 to 3 Title Case words, usually plural, e.g. "Phone Accessories".',
    '- Never a brand, model, colour, size, price or condition.',
  );
  if (existing?.length) {
    lines.push(`- When one of these fits, reuse its exact name: ${existing.map((c) => `"${c}"`).join(', ')}.`);
  }
  return {
    systemInstruction: { parts: [{ text: SHOP_CATEGORY_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: lines.join('\n') }] }],
    generationConfig: { ...generationConfig, maxOutputTokens: 400 },
  };
}

function parseShopCategories(rawText) {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }
  }
  const list = Array.isArray(parsed?.categories) ? parsed.categories : [];
  const names = list
    .map((item) => String(item || '').trim().replace(/\s+/g, ' ').slice(0, 36))
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 12);
  return names.length ? names : null;
}

/** `meta` = { account: { id, label }, purpose } for the admin usage log. */
async function callModel(model, body, apiKey, meta = {}) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    recordUsage(model, { ...meta, ms: Date.now() - started, error: error.message || 'Network error' });
    throw error;
  }
  const payload = await res.json().catch(() => null);
  recordUsage(model, {
    ...meta,
    ms: Date.now() - started,
    ok: res.ok,
    quota: isQuotaError(res.status, payload),
    error: payload?.error?.message || `HTTP ${res.status}`,
  });
  return { res, payload };
}

// Gemini regularly answers 503 "high demand" on free-tier keys; those are worth
// one quick retry instead of failing the whole screen.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModelWithRetry(model, body, apiKey, meta) {
  let result = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = await callModel(model, body, apiKey, meta);
    if (result.res.ok || !RETRYABLE_STATUSES.has(result.res.status)) return result;
    if (isQuotaError(result.res.status, result.payload)) return result;
    if (attempt === 0) await sleep(300);
  }
  return result;
}

/**
 * Runs `makeBody` against every enabled account/model until `parse` returns a value,
 * switching on quota and key errors.
 */
async function runGemini(makeBody, parse, purpose = '') {
  const configs = [
    { ...GENERATION_CONFIG, thinkingConfig: { thinkingBudget: 0 } },
    GENERATION_CONFIG,
  ];

  const settings = await getAiSettings();
  if (!(settings.models || []).some((model) => model.enabled)) {
    const error = new Error('AI is turned off right now. Please fill the details yourself.');
    error.status = 503;
    throw error;
  }
  const accounts = candidateAccounts(settings);
  if (!accounts.length) {
    const error = new Error('No AI account is available. Add a Gemini key in the admin panel.');
    error.status = 503;
    throw error;
  }

  let lastError = null;
  for (const account of accounts) {
    const candidates = modelsForAccount(settings, account);
    if (!candidates.length) continue;
    let accountFailed = false;
    for (const model of candidates) {
      if (accountFailed) break;
      for (const generationConfig of configs) {
        let res;
        let payload;
        try {
          ({ res, payload } = await callModelWithRetry(model, makeBody(generationConfig), account.apiKey, {
            account: { id: account.id, label: account.label },
            purpose,
          }));
        } catch (error) {
          lastError = error;
          break;
        }

        const text =
          payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') ||
          '';
        if (res.ok) {
          const result = parse(text);
          if (result) return { result, model, account: account.label };
          lastError = new Error('Gemini returned an unreadable response');
          break;
        }

        const message = payload?.error?.message || `Gemini request failed (${res.status})`;
        if (isKeyError(res.status, payload)) {
          await markAccountBlocked(account.id, Date.now() + 24 * 60 * 60 * 1000, message);
          console.warn(`[ai] ${account.label} key rejected, switching to the next account`);
          lastError = new Error(message);
          accountFailed = true;
          break;
        }

        if (isQuotaError(res.status, payload)) {
          const until = Date.now() + retryDelayMs(payload);
          await markAccountModelBlocked(account.id, model, until, message);
          console.warn(`[ai] ${account.label} / ${model} quota used, trying the next model or account`);
          lastError = quotaError();
          break;
        }

        lastError = new Error(message);
        if (res.status !== 400) break;
      }
    }
  }

  throw lastError || new Error('AI suggestion failed');
}

/**
 * Analyse a product photo with Gemini vision and return listing details,
 * an NPR price guess, and a safety verdict for the photo.
 * `shop` ({ type, categories }) steers the category towards the seller's store.
 */
async function suggestListingFromImage({ data, mimeType = 'image/jpeg', categories = [], shop = null }) {
  const { result, model, account } = await runGemini(
    (generationConfig) => buildBody(generationConfig, data, mimeType, categories, shop),
    parseSuggestion,
    'listing',
  );
  return { suggestion: result, model, account };
}

/** Product category names a store of this type would sell. */
async function suggestShopCategories({ type, name = '', description = '', existing = [] }) {
  const { result, model } = await runGemini(
    (generationConfig) => buildShopCategoriesBody(generationConfig, { type, name, description, existing }),
    parseShopCategories,
    'shop-categories',
  );
  return { categories: result, model };
}

function quotaError() {
  const error = new Error("Today's AI limit is used up. Please fill the details yourself.");
  error.status = 429;
  return error;
}

/** Lists models this API key can call for generateContent (used by the admin panel). */
async function listAvailableModels(apiKey) {
  const settings = await getAiSettings();
  const key = apiKey || candidateAccounts(settings)[0]?.apiKey;
  if (!key) return [];
  const url = `${GEMINI_BASE}?pageSize=200&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error?.message || `Could not list models (${res.status})`);
  return (payload?.models || [])
    .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map((model) => String(model.name || '').replace(/^models\//, ''))
    .filter((name) => /^gemini/i.test(name) && !/(tts|image|embedding|audio|live)/i.test(name));
}

/** Sends a one-word text prompt to check that a model answers (uses one request of its quota). */
async function testModel(model, apiKey, accountId, accountLabel = '') {
  const settings = await getAiSettings();
  const fallback = candidateAccounts(settings)[0];
  const key = apiKey || fallback?.apiKey;
  if (!key) {
    return { ok: false, status: 503, ms: 0, message: 'No AI account is configured' };
  }
  const account = apiKey
    ? { id: accountId || '', label: accountLabel }
    : { id: fallback.id, label: fallback.label };
  const started = Date.now();
  const { res, payload } = await callModel(model, {
    contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
    generationConfig: { maxOutputTokens: 5, temperature: 0 },
  }, key, { account, purpose: 'test' });
  const message = res.ok ? 'Model answered' : payload?.error?.message || `HTTP ${res.status}`;
  if (isQuotaError(res.status, payload)) {
    const until = Date.now() + retryDelayMs(payload);
    if (accountId) await markAccountModelBlocked(accountId, model, until, message);
    else await markModelBlocked(model, until);
  }
  if (accountId && isKeyError(res.status, payload)) {
    await markAccountBlocked(accountId, Date.now() + 24 * 60 * 60 * 1000, message);
  }
  return {
    ok: res.ok,
    status: res.status,
    ms: Date.now() - started,
    message: res.ok ? 'Model answered' : payload?.error?.message || `HTTP ${res.status}`,
  };
}

module.exports = { listAvailableModels, suggestListingFromImage, suggestShopCategories, testModel };
