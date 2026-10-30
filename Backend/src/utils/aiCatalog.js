/**
 * Every Gemini API model with a free-tier limit (AI Studio → Rate limit, free tier), what it
 * does, and where KinBech uses it or could. `rpm`/`rpd` null = unlimited, 0 = paid only.
 * `name` is the API id where Google's model list confirms it; Live and embedding models are
 * not listed for generateContent, so they carry a label only.
 *
 * status: used = in the photo-fill chain; idea = free and fits a KinBech feature;
 *         test = could work, needs a real test first; limited = free but too small to matter;
 *         no = not usable or not useful here; paid = 0 free requests.
 */
const CATALOG = [
  // Reads photos: the listing auto-fill chain, best first.
  { name: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', kind: 'vision', rpm: 5, tpm: 250000, rpd: 20, status: 'used',
    job: 'Reads photos and text', use: 'Photo → listing form, 1st choice. Named the exact model in tests, in ~3 s.' },
  { name: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', kind: 'vision', rpm: 5, tpm: 250000, rpd: 20, status: 'used',
    job: 'Reads photos and text', use: 'Photo → listing form, 2nd choice. Exact model names, ~6 s.' },
  { name: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', kind: 'vision', rpm: 15, tpm: 250000, rpd: 500, status: 'used',
    job: 'Reads photos and text, fast', use: 'Photo → listing form for most of the day (500/day), and shop categories.' },
  { name: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', kind: 'vision', rpm: 5, tpm: 250000, rpd: 20, status: 'used',
    job: 'Reads photos and text', use: 'Photo → listing form backup. Accurate but often very slow; the engine rests it when it hangs.' },
  { name: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', kind: 'vision', rpm: 15, tpm: 250000, rpd: 500, status: 'used',
    job: 'Reads photos and text, fast', use: 'Last photo backup (500/day). Less exact on model names.' },

  // Free, not in use yet.
  { name: '', label: 'Gemini Embedding 1', kind: 'embedding', rpm: 100, tpm: 30000, rpd: 1000, status: 'idea',
    job: 'Turns text into meaning vectors', use: 'Smart search ("sasto phone" finds budget mobiles), similar items, duplicate listings.' },
  { name: '', label: 'Gemini Embedding 2', kind: 'embedding', rpm: 100, tpm: 30000, rpd: 1000, status: 'idea',
    job: 'Turns text into meaning vectors', use: 'Second quota for search queries next to Embedding 1.' },
  { name: '', label: 'Gemini 3.5 Transcribe Live', kind: 'live', rpm: null, tpm: 20000, rpd: null, status: 'idea',
    job: 'Live speech → text', use: 'Voice search, and chat voice messages shown as text.' },
  { name: '', label: 'Gemini 3 Flash Live', kind: 'live', rpm: null, tpm: 65000, rpd: null, status: 'idea',
    job: 'Live voice/video conversation', use: 'Speak to create a listing ("Samsung A52, 2 years old, 25 hazar").' },
  { name: '', label: 'Gemini 3.8 Live', kind: 'live', rpm: null, tpm: 65000, rpd: null, status: 'test',
    job: 'Live voice/video conversation, smarter', use: 'Live camera product scan; an unlimited photo-fill backup if it reads products well.' },
  { name: '', label: 'Gemini 3.8 Live Extended Thinking', kind: 'live', rpm: null, tpm: 65000, rpd: null, status: 'idea',
    job: 'Live conversation that reasons', use: 'Voice assistant for buyer questions ("is this price fair?").' },
  { name: '', label: 'Gemini 2.5 Flash Native Audio Dialog', kind: 'live', rpm: null, tpm: 1000000, rpd: null, status: 'idea',
    job: 'Natural spoken conversation', use: 'Nepali/Hindi voice help ("how do I post a listing?").' },
  { name: '', label: 'Gemini 3.5 Live Translate', kind: 'live', rpm: null, tpm: 20000, rpd: null, status: 'idea',
    job: 'Live speech translation', use: 'Translate buyer–seller calls (Nepali ↔ Hindi ↔ English).' },
  { name: 'gemini-robotics-er-2-preview', label: 'Gemini Robotics ER 2 Preview', kind: 'vision', rpm: 5, tpm: 250000, rpd: 20, status: 'test',
    job: 'Finds and points at objects in photos', use: 'Auto-crop the product, warn when it is too small in the photo.' },

  // Free but not worth it here.
  { name: 'gemma-4-26b-a4b-it', label: 'Gemma 4 26B', kind: 'text', rpm: 30, tpm: 16000, rpd: 14400, status: 'no',
    job: 'Open model, text', use: 'Tested: called a MacBook Air a "Pro", took 42 s, empty answers and 500 errors.' },
  { name: 'gemma-4-31b-it', label: 'Gemma 4 31B', kind: 'text', rpm: 30, tpm: 16000, rpd: 14400, status: 'no',
    job: 'Open model, text', use: 'Tested: 500 and "high demand" errors on every try.' },
  { name: 'gemini-3.5-transcribe', label: 'Gemini 3.5 Transcribe', kind: 'audio', rpm: 3, tpm: 10000, rpd: 25, status: 'limited',
    job: 'Recorded speech → text', use: 'Only 25/day; Transcribe Live does the same without a daily limit.' },
  { name: 'gemini-3.8-flash-tts', label: 'Gemini 3.8 Flash TTS', kind: 'audio', rpm: 3, tpm: 10000, rpd: 10, status: 'limited',
    job: 'Text → speech', use: 'Record fixed audio once (Nepali onboarding, meetup safety tips).' },
  { name: 'gemini-3.8-flash-lite-tts', label: 'Gemini 3.8 Flash Lite TTS', kind: 'audio', rpm: 3, tpm: 10000, rpd: 10, status: 'limited',
    job: 'Text → speech', use: 'Same as 3.8 Flash TTS: fixed clips only.' },
  { name: 'gemini-3.1-flash-tts-preview', label: 'Gemini 3.1 Flash TTS', kind: 'audio', rpm: 3, tpm: 10000, rpd: 10, status: 'limited',
    job: 'Text → speech', use: 'Fixed clips only.' },
  { name: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash TTS', kind: 'audio', rpm: 3, tpm: 10000, rpd: 10, status: 'limited',
    job: 'Text → speech', use: 'Fixed clips only.' },
  { name: 'antigravity-preview-latest', label: 'Antigravity', kind: 'agent', rpm: 60, tpm: 100000, rpd: 100, status: 'no',
    job: 'Coding agent', use: 'A developer tool, not an app feature.' },
  { name: '', label: 'Search grounding (Gemini 2 / 2.5)', kind: 'tool', rpm: null, tpm: null, rpd: 1500, status: 'no',
    job: 'Answers backed by Google Search', use: 'Would give real market prices, but only works with Gemini 2/2.5, which new keys cannot use.' },
  { name: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', kind: 'vision', rpm: 5, tpm: 250000, rpd: 20, status: 'no',
    job: 'Reads photos and text', use: 'Google answers 404: closed to new users.' },
  { name: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', kind: 'vision', rpm: 10, tpm: 250000, rpd: 20, status: 'no',
    job: 'Reads photos and text', use: 'Google answers 404: closed to new users.' },
  { name: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', kind: 'vision', rpm: 0, tpm: 0, rpd: 0, status: 'no',
    job: 'Reads photos and text', use: 'Not on the free tier; took 119 s in tests.' },
  { name: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', kind: 'vision', rpm: 0, tpm: 0, rpd: 0, status: 'no',
    job: 'Reads photos and text', use: 'Not on the free tier; "high demand" in tests.' },

  // Paid only (0 free requests).
  { name: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', kind: 'vision', rpm: 0, tpm: 0, rpd: 0, status: 'paid', job: 'Smarter text and photos', use: 'Needs billing.' },
  { name: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', kind: 'vision', rpm: 0, tpm: 0, rpd: 0, status: 'paid', job: 'Smarter text and photos', use: 'Needs billing.' },
  { name: 'gemini-4-argon', label: 'Gemini 4 Argon', kind: 'vision', rpm: 0, tpm: 0, rpd: 0, status: 'paid', job: 'Text and photos', use: 'Needs billing.' },
  { name: '', label: 'Gemini 2 Flash / 2 Flash Lite', kind: 'vision', rpm: 0, tpm: 0, rpd: 0, status: 'paid', job: 'Text and photos', use: 'Needs billing.' },
  { name: '', label: 'Nano Banana (all versions)', kind: 'image', rpm: 0, tpm: 0, rpd: 0, status: 'paid', job: 'Makes or edits images', use: 'Needs billing.' },
  { name: '', label: 'Veo 3 / Lyria 3', kind: 'media', rpm: 0, tpm: null, rpd: 0, status: 'paid', job: 'Makes video / music', use: 'Needs billing.' },
  { name: '', label: 'Deep Research, Computer Use', kind: 'agent', rpm: 0, tpm: 0, rpd: 0, status: 'paid', job: 'Research and browser agents', use: 'Needs billing.' },
];

const byName = new Map(CATALOG.filter((item) => item.name).map((item) => [item.name, item]));

function catalogEntry(name) {
  return byName.get(name) || null;
}

module.exports = { CATALOG, catalogEntry };
