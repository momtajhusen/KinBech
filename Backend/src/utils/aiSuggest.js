const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const {
  candidateModels,
  getAiSettings,
  markModelBlocked,
  recordUsage,
} = require('./aiSettings');

// Set GEMINI_API_KEY in the server environment; models are managed from the admin panel.

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

const SYSTEM_INSTRUCTION =
  'You analyse product photos for a classifieds marketplace and reply with valid JSON only.';

// Short output + no thinking keeps the round trip fast for an on-screen auto-fill.
const GENERATION_CONFIG = {
  temperature: 0.2,
  maxOutputTokens: 900,
  responseMimeType: 'application/json',
};

function apiKey() {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    const error = new Error('GEMINI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }
  return key;
}

function buildPrompt(categories) {
  const list = (categories || []).filter(Boolean);
  const lines = [
    'You are a listing assistant for KinBech, a Nepali buy-and-sell marketplace.',
    'Study the attached product photo carefully before answering.',
    'Read every visible clue: brand, model name or number printed on the item, colour,',
    'material, finish, size, ports and buttons, packaging, accessories in the frame, and',
    'any wear, scratches, dents or missing parts. Zoom into small text or labels when',
    'that helps you identify the exact model.',
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"title": string, "description": string, "category": string, "condition": string, "searchWords": string[]}',
    '',
    'Title rules (most important):',
    '- Write the title exactly as a buyer would type it into a search box.',
    '- Just brand + model + the one or two specs that really matter, 3 to 7 words.',
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
    '- searchWords: 8 to 14 short phrases a different buyer might type for this same item.',
    '- Mix English and simple Roman Nepali when natural, plus colour, use, and category words.',
    '- Examples of variety, not a fixed list: "plastic chair", "nil chair", "stackable chair".',
    '- No duplicates, no price, no full sentences.',
    '- condition: exactly one of "New", "Good", "Fair", judged from the visible wear.',
    '- If something is unclear, give your best reasonable guess instead of leaving it empty.',
  ];
  if (list.length) {
    lines.push(
      `- category: exactly one of ${list.map((c) => `"${c}"`).join(', ')}, choosing the closest match.`,
    );
  } else {
    lines.push('- category: a short marketplace category name.');
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

  const title = String(parsed.title || '').trim();
  const description = String(parsed.description || '').trim();
  if (!title && !description) return null;

  const conditionRaw = String(parsed.condition || '').trim().toLowerCase();
  const searchWords = Array.isArray(parsed.searchWords)
    ? parsed.searchWords
        .map((word) => String(word || '').trim().replace(/\s+/g, ' ').slice(0, 40))
        .filter(Boolean)
        .filter((word, index, all) => all.findIndex((item) => item.toLowerCase() === word.toLowerCase()) === index)
        .slice(0, 14)
    : [];
  return {
    title: title.slice(0, 120),
    description: description.slice(0, 1600),
    category: String(parsed.category || '').trim() || null,
    condition: CONDITIONS.find((c) => c.toLowerCase() === conditionRaw) || null,
    searchWords,
  };
}

function buildBody(generationConfig, data, mimeType, categories) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data } },
          { text: buildPrompt(categories) },
        ],
      },
    ],
    generationConfig,
  };
}

async function callModel(model, body) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey())}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    recordUsage(model, { error: error.message || 'Network error' });
    throw error;
  }
  const payload = await res.json().catch(() => null);
  recordUsage(model, {
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

async function callModelWithRetry(model, body) {
  let result = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = await callModel(model, body);
    if (result.res.ok || !RETRYABLE_STATUSES.has(result.res.status)) return result;
    if (isQuotaError(result.res.status, result.payload)) return result;
    if (attempt === 0) await sleep(300);
  }
  return result;
}

/**
 * Analyse a product photo with Gemini vision and return listing details.
 * Price is intentionally never requested or returned.
 */
async function suggestListingFromImage({ data, mimeType = 'image/jpeg', categories = [] }) {
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
  const candidates = candidateModels(settings);
  if (!candidates.length) throw quotaError();

  let lastError = null;
  for (const model of candidates) {
    for (const generationConfig of configs) {
      let res;
      let payload;
      try {
        ({ res, payload } = await callModelWithRetry(
          model,
          buildBody(generationConfig, data, mimeType, categories),
        ));
      } catch (error) {
        lastError = error;
        break;
      }

      const text =
        payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') ||
        '';
      if (res.ok) {
        const suggestion = parseSuggestion(text);
        if (suggestion) return { suggestion, model };
        lastError = new Error('Gemini returned an unreadable response');
        break;
      }

      if (isQuotaError(res.status, payload)) {
        await markModelBlocked(model, Date.now() + retryDelayMs(payload));
        console.warn(
          settings.autoSwitch
            ? `[ai] ${model} daily quota used up, switching to the next model`
            : `[ai] ${model} daily quota used up (auto switch is off)`
        );
        lastError = quotaError();
        break;
      }

      lastError = new Error(
        payload?.error?.message || `Gemini request failed (${res.status})`,
      );
      // Only a 400 retries the same model without the thinking flag.
      if (res.status !== 400) break;
    }
  }

  throw lastError || new Error('AI suggestion failed');
}

function quotaError() {
  const error = new Error("Today's AI limit is used up. Please fill the details yourself.");
  error.status = 429;
  return error;
}

/** Lists models this API key can call for generateContent (used by the admin panel). */
async function listAvailableModels() {
  const url = `${GEMINI_BASE}?pageSize=200&key=${encodeURIComponent(apiKey())}`;
  const res = await fetch(url);
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error?.message || `Could not list models (${res.status})`);
  return (payload?.models || [])
    .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map((model) => String(model.name || '').replace(/^models\//, ''))
    .filter((name) => /^gemini/i.test(name) && !/(tts|image|embedding|audio|live)/i.test(name));
}

/** Sends a one-word text prompt to check that a model answers (uses one request of its quota). */
async function testModel(model) {
  const started = Date.now();
  const { res, payload } = await callModel(model, {
    contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
    generationConfig: { maxOutputTokens: 5, temperature: 0 },
  });
  if (isQuotaError(res.status, payload)) {
    await markModelBlocked(model, Date.now() + retryDelayMs(payload));
  }
  return {
    ok: res.ok,
    status: res.status,
    ms: Date.now() - started,
    message: res.ok ? 'Model answered' : payload?.error?.message || `HTTP ${res.status}`,
  };
}

module.exports = { listAvailableModels, suggestListingFromImage, testModel };
