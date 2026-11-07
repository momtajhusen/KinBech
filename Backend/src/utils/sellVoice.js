const { runGemini } = require('./aiSuggest');
const { IDENTITY_KEYS } = require('./listingDetails');

/**
 * The Hindi voice helper on the sell screens: one turn takes the form as it is now, the open step and
 * what the seller said, and returns a short Hindi line to speak plus the changes to make in the app.
 */

const STAGES = ['check', 'details', 'form', 'publish'];
const EVENTS = ['start', 'stage', 'reply', 'quiet'];
const CONTROL_KINDS = ['button', 'toggle', 'select', 'text', 'number'];
// About 40 s of the phone's 16 kHz mono WAV, base64.
const MAX_AUDIO_CHARS = 1800 * 1000;
const EMPTY_TURN = { reply: '', set: {}, descriptionAdd: '', details: {}, check: null, actions: [], detailsDone: null, publish: null, stop: false, heard: '' };
// A conversation is Nepali until the helper asks the seller to speak Hindi; then Hindi until it ends.
const LANGUAGES = ['ne', 'hi'];
const TO_HINDI = 'हिंदी में मुझसे बात करो।';
// Fixed lines per language: asked instead of posting while the company or model is empty, and so on.
const LINES = {
  ne: {
    company: 'पब्लिश गर्नुअघि भन्नुहोस्, यो कुन कम्पनीको हो?',
    model: 'पब्लिश गर्नुअघि भन्नुहोस्, यसको मोडल कुन हो?',
    both: 'पब्लिश गर्नुअघि भन्नुहोस्, यो कुन कम्पनीको हो र मोडल कुन हो?',
    added: 'ठिक छ, थपें। अब पब्लिश गरिदिऊँ?',
    blocked: 'माफ गर्नुहोस्, यसमा म मद्दत गर्न सक्दिनँ।',
  },
  hi: {
    company: 'पब्लिश करने से पहले बताइए, यह किस कंपनी का है?',
    model: 'पब्लिश करने से पहले बताइए, इसका मॉडल कौन सा है?',
    both: 'पब्लिश करने से पहले बताइए, यह किस कंपनी का है और मॉडल कौन सा है?',
    added: 'ठीक है, जोड़ दिया। अब पब्लिश कर दूँ?',
    blocked: 'माफ़ कीजिए, इसमें मैं मदद नहीं कर सकता।',
  },
};

const INSTRUCTION = [
  'You are the voice helper of KinBech, a Nepali buy-and-sell app. A seller has just taken a photo',
  'of an item and you help them post it by talking. You only ever reply with JSON.',
  '',
  'Language ("language" in the input, and "language" in your JSON):',
  '- "ne" (every conversation starts so): speak Nepali in Devanagari script, never Hindi, never English sentences.',
  '- With "ne", when the seller speaks any other language (Hindi, English, Hinglish or any other; not Nepali),',
  '  or asks you to speak Hindi, start "reply" with exactly "हिंदी में मुझसे बात करो।", then at most one short',
  '  Hindi sentence answering them, and set "language": "hi". Still fill what they told you.',
  '- "hi": the conversation switched to Hindi: speak Hindi in Devanagari until it ends, never Nepali.',
  '  Keep "language": "hi" (it never goes back to "ne" within a conversation).',
  '- Short words both languages share (OK, ठीक, हजार, numbers, product names) are not a language switch.',
  '  Speech-to-text writes both in Devanagari, so judge by Nepali words (छ, हो, गर्नुहोस्, भयो, पर्छ) versus',
  '  Hindi words (है, हूँ, करो, कर दो, नहीं, चाहिए).',
  '',
  'How you speak ("reply"):',
  '- Warm and simple, like a helpful local shopkeeper.',
  '- At most 2 short sentences, under 30 words. Ask one thing at a time.',
  '- English product words are fine as they are (RAM, GB, storage, iPhone). Prices as digits with "रुपैयाँ"',
  '  in Nepali, "रुपये" in Hindi.',
  '- Never read out the whole form. Never mention JSON, fields or the app\'s buttons by code names.',
  '',
  'Events:',
  '- "start": you speak first for this item. Say what the seller is selling, e.g. Nepali "ल, तपाईं',
  '  Samsung Galaxy A52 बेच्दै हुनुहुन्छ।" (Hindi: "अच्छा, आप Samsung Galaxy A52 बेच रहे हैं।"), then ask the',
  '  first question of the step.',
  '  When the photo was unclear, say so gently instead of naming the item for sure.',
  '- "stage": a new step opened; ask its first question, no greeting.',
  '- "reply": the seller said "said". Fill what they told you, then ask the next thing.',
  '  "said_also" (when given) are other ways the phone heard the same words; Hindi speech-to-text often',
  '  mishears, so use whichever fits the step best.',
  '  When an audio clip is attached, "said" is empty: the seller\'s words are in the clip, maybe quiet or far',
  '  from the phone. Put what they said in "heard" (Devanagari for Nepali and Hindi) and answer it. If the clip has no',
  '  clear words, set "heard" to "" and kindly ask them to say it again a little louder.',
  '  When "speaking_over" is given, the clip was recorded while you were saying that line, so your own voice',
  '  is in it: put only the seller\'s words in "heard" and answer them. If the seller said nothing (only your',
  '  voice or noise), set "heard" and "reply" to "" and change nothing.',
  '  With an audio clip never use "publish": "confirm" and never say you are posting: at most "open" the',
  '  review and ask the seller to say OK once more.',
  '- "quiet": the seller did not answer. Ask the same thing again in fewer words.',
  '',
  'Steps ("stage"):',
  '- "check": AI is not sure what the photo shows. "check" has its guess, a confidence and other options.',
  '  Ask whether the guess is right. Answers: yes → "check": "main". They name one of the options →',
  '  "check": "alt:<index>". They describe another item → "check": {"title": <5-word English search title>,',
  '  "category": <one of the categories>}. They are not sure → "check": "unsure", then ask what the item is.',
  '  They want a new photo → "check": "retake".',
  '- "details": the item\'s details card is open ("details.fields", each with key, label, options, value).',
  '  Ask for empty fields, one or two at a time, saying buyers ask for them. Put answers in "details" as',
  '  key → value: copy the exact option text when options exist, digits only for numeric fields.',
  '  When every field has a value, or the seller says skip / pata nahi / bas, set "detailsDone": "save"',
  '  (or "skip" when nothing was given) and say in a few words what you added.',
  '- In any step, "details" (when given, with "open": false) are the saved item details. When the seller',
  '  wants to change one ("RAM change karo"), put the new value in "details" and set "detailsDone": "save";',
  '  the app opens the card, changes it and saves. If they did not say the new value, press "edit_details"',
  '  and ask for it.',
  '- "form": the main form. First fill what is missing ("missing"), then confirm what AI filled, one by one:',
  '  the item name, the condition, the price (mention the AI price when there is one) and whether the',
  '  price is negotiable. Use "history" so you never ask the same thing twice. When nothing is missing and',
  '  the seller has confirmed, say the item and price in one line and ask "यो पब्लिश गरिदिऊँ?" (Hindi:',
  '  "क्या मैं इसे पब्लिश कर दूँ?"). Yes → "publish": "open". When the seller clearly says to post it now',
  '  ("ठिक छ, पब्लिश गरिदिनुस्", "theek hai, publish kar do") and',
  '  nothing is missing, use "publish": "confirm" straight away: the app opens the review and posts.',
  '- "publish": the final review is open. Ask for a last OK. Yes → "publish": "confirm". They want a',
  '  change → "publish": "cancel", fill the change, and ask what else.',
  '- Company and model: when "details" has "company" or "model" fields, both need a value before posting.',
  '  When the seller (at any time), the title or the description already names them, put them in "details"',
  '  right away without asking (with the card closed also "detailsDone": "save"), e.g. "Samsung" and',
  '  "Galaxy A52". Otherwise ask "यो कुन कम्पनीको हो र मोडल कुन हो?" (Hindi: "यह किस कंपनी का है और मॉडल',
  '  कौन सा है?") before asking to publish, and',
  '  never "open" or "confirm" publishing while one is empty. If the seller does not know, put "Not known".',
  '- The phone\'s mic can pick up your own voice. When "said" mostly repeats your last line (e.g. "पब्लिश',
  '  गरिदिऊँ", "पब्लिश कर दूँ"), it is your echo, not the seller\'s yes (and not a language switch): never "open" or',
  '  "confirm" publishing on it; ask again briefly.',
  '',
  'Filling ("set"), only what the seller said or clearly agreed to:',
  '- "title": exactly 5 English words a buyer would search (brand, model, key spec).',
  '- "category": exactly one of "categories". "condition": exactly one of "conditions".',
  '- "price": whole rupees as a number. "negotiable": true or false.',
  '- Shops only: "brand" text and "stock" number.',
  '- "descriptionAdd": one short English sentence with a new fact the seller told you (warranty, bill,',
  '  defect, reason for selling) that has no field. Never repeat what the description already says.',
  '- Leave everything else out. Never invent a spec the seller did not say.',
  '',
  'Screen controls ("controls"): everything the seller could tap on the screen right now, each with an',
  '"id", a "kind" and a "label". The seller can run any of them by voice, as if tapping it:',
  '- "button": press it with {"id": <id>}. "toggle": {"id": <id>, "value": true | false}.',
  '- "select": {"id": <id>, "value": <exact option>}. "text" and "number": {"id": <id>, "value": <value>}.',
  '- Put them in "actions" in the order to run, at most 4. Only use ids from "controls".',
  '- Say what you are doing in the reply ("ठिक छ, पब्लिश गर्दैछु।" / "ठीक है, पब्लिश कर रहा हूँ।"). A control that posts, deletes,',
  '  clears or leaves runs only when the seller clearly asked for it.',
  '- "set", "check", "detailsDone" and "publish" stay the main way to fill and confirm; use actions for',
  '  anything else the seller asks the screen to do.',
  '',
  'If the seller asks you to stop or be quiet, set "stop": true with a short goodbye.',
  '',
  'JSON shape: {"reply": string, "set": {}, "descriptionAdd": string, "details": {}, "check": string | object | null,',
  '"detailsDone": "save" | "skip" | null, "publish": "open" | "confirm" | "cancel" | null,',
  '"actions": [{"id": string, "value": any}], "stop": boolean, "language": "ne" | "hi",',
'"heard": string (only with an audio clip)}',
].join('\n');

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const names = (list, max) => (Array.isArray(list) ? list : []).map((item) => text(item, 40)).filter(Boolean).slice(0, max);
const pickName = (list, value) => list.find((item) => item.toLowerCase() === text(value, 60).toLowerCase()) || null;

/** "company" / "model" detail fields with no value (none for items that have no such fields). */
const emptyIdentity = (details, filled = {}) =>
  (details?.fields || [])
    .filter((field) => IDENTITY_KEYS.includes(field.key) && !field.value && !filled[field.key])
    .map((field) => field.key);

function cleanInput(body = {}) {
  const form = body.form && typeof body.form === 'object' ? body.form : {};
  const categories = names(body.categories, 80);
  const conditions = names(body.conditions, 5);
  const forShop = body.forShop === true;
  const check = body.check && typeof body.check === 'object'
    ? {
        title: text(body.check.title, 120),
        category: text(body.check.category, 40),
        condition: text(body.check.condition, 10),
        price: Number(body.check.price) || 0,
        confidence: Number.isFinite(Number(body.check.confidence)) ? Number(body.check.confidence) : null,
        photoIssue: text(body.check.photoIssue, 20),
        photoNote: text(body.check.photoIssueNote, 160),
        alternatives: (Array.isArray(body.check.alternatives) ? body.check.alternatives : [])
          .slice(0, 3)
          .map((alt, index) => ({ index, title: text(alt?.title, 120), category: text(alt?.category, 40) })),
      }
    : null;
  const controls = (Array.isArray(body.controls) ? body.controls : [])
    .slice(0, 30)
    .map((control) => ({
      id: text(control?.id, 40),
      kind: CONTROL_KINDS.includes(control?.kind) ? control.kind : 'button',
      label: text(control?.label, 100),
      ...(Array.isArray(control?.options) ? { options: names(control.options, 12) } : {}),
      ...(control?.value !== undefined && control?.value !== null ? { value: typeof control.value === 'boolean' ? control.value : text(control.value, 60) } : {}),
    }))
    .filter((control) => control.id);
  const details = body.details && Array.isArray(body.details.fields)
    ? {
        open: body.details.open !== false,
        label: text(body.details.label, 40),
        fields: body.details.fields.slice(0, 10).map((field) => ({
          key: text(field?.key, 30),
          label: text(field?.label, 40),
          ...(Array.isArray(field?.options) ? { options: names(field.options, 10) } : {}),
          ...(field?.unit ? { unit: text(field.unit, 10) } : {}),
          ...(field?.numeric ? { numeric: true } : {}),
          value: text(field?.value, 40),
        })).filter((field) => field.key),
      }
    : null;
  const cleanForm = {
    title: text(form.title, 120),
    description: text(form.description, 600),
    category: text(form.category, 40),
    condition: text(form.condition, 10),
    price: text(form.price, 12),
    negotiable: form.negotiable !== false,
    location: text(form.location, 80),
    ...(forShop ? { brand: text(form.brand, 40), stock: text(form.stock, 6) } : {}),
  };
  const missing = [
    !cleanForm.title && 'item name (title)',
    !cleanForm.price && 'price',
    ...emptyIdentity(details).map((key) => (key === 'company' ? 'company (brand)' : 'model')),
  ].filter(Boolean);
  const said = text(body.said, 400);
  const audio = !said && typeof body.audio === 'string' && body.audio.length <= MAX_AUDIO_CHARS && /^[A-Za-z0-9+/]+=*$/.test(body.audio)
    ? body.audio
    : '';
  return {
    event: EVENTS.includes(body.event) ? body.event : 'reply',
    stage: STAGES.includes(body.stage) ? body.stage : 'form',
    language: LANGUAGES.includes(body.language) ? body.language : 'ne',
    said,
    ...(said && Array.isArray(body.heardAlso)
      ? { said_also: body.heardAlso.map((item) => text(item, 400)).filter((item) => item && item !== said).slice(0, 3) }
      : {}),
    audio,
    ...(audio && body.speakingOver ? { speaking_over: text(body.speakingOver, 400) } : {}),
    forShop,
    form: cleanForm,
    missing,
    aiPrice: Number(body.aiPrice) || null,
    categories,
    conditions,
    check,
    details,
    controls,
    history: (Array.isArray(body.history) ? body.history : [])
      .slice(-10)
      .map((turn) => ({ role: turn?.role === 'assistant' ? 'assistant' : 'seller', text: text(turn?.text, 300) }))
      .filter((turn) => turn.text),
  };
}

function cleanTurn(raw, input) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(raw || '').match(/\{[\s\S]*\}/)?.[0] || '');
  } catch {
    return null;
  }
  let reply = text(parsed?.reply, 400);
  if (!reply) {
    // A clip taken over the helper's own line with no seller words in it: nothing to do.
    return input.speaking_over && parsed && !text(parsed.heard, 400) ? { ...EMPTY_TURN, language: input.language } : null;
  }
  // Hindi from the moment the helper asks for it; never back to Nepali within the conversation.
  const switching = input.language === 'ne' && (parsed.language === 'hi' || reply.startsWith(TO_HINDI.slice(0, -1)));
  const language = input.language === 'hi' || switching ? 'hi' : 'ne';
  if (switching && !reply.startsWith(TO_HINDI.slice(0, -1))) reply = `${TO_HINDI} ${reply}`.slice(0, 400);
  const lines = LINES[language];

  const setRaw = parsed.set && typeof parsed.set === 'object' ? parsed.set : {};
  const set = {};
  const title = text(setRaw.title, 120).split(' ').slice(0, 5).join(' ');
  if (title) set.title = title;
  const category = pickName(input.categories, setRaw.category);
  if (category) set.category = category;
  const condition = pickName(input.conditions, setRaw.condition);
  if (condition) set.condition = condition;
  const price = Math.round(Number(String(setRaw.price ?? '').replace(/[^\d.]/g, '')));
  if (Number.isFinite(price) && price > 0) set.price = price;
  if (typeof setRaw.negotiable === 'boolean') set.negotiable = setRaw.negotiable;
  if (input.forShop) {
    const brand = text(setRaw.brand, 40);
    if (brand) set.brand = brand;
    const stock = Math.round(Number(setRaw.stock));
    if (Number.isFinite(stock) && stock > 0) set.stock = stock;
  }

  const details = {};
  if (input.details && parsed.details && typeof parsed.details === 'object') {
    input.details.fields.forEach((field) => {
      let value = text(parsed.details[field.key], 40);
      if (!value) return;
      if (field.options) value = field.options.find((option) => option.replace(/\s/g, '').toLowerCase() === value.replace(/\s/g, '').toLowerCase()) || value;
      if (field.numeric) value = (value.replace(/,/g, '').match(/\d+(\.\d+)?/) || [''])[0];
      if (value) details[field.key] = value;
    });
  }

  let check = null;
  if (input.stage === 'check' && input.check) {
    const rawCheck = parsed.check;
    const alt = typeof rawCheck === 'string' && rawCheck.match(/^alt:(\d)$/);
    if (['main', 'unsure', 'retake'].includes(rawCheck)) check = rawCheck;
    else if (alt && input.check.alternatives[Number(alt[1])]) check = `alt:${alt[1]}`;
    else if (rawCheck && typeof rawCheck === 'object' && text(rawCheck.title, 120)) {
      check = {
        title: text(rawCheck.title, 120).split(' ').slice(0, 5).join(' '),
        category: pickName(input.categories, rawCheck.category),
      };
    }
  }

  const actions = (Array.isArray(parsed.actions) ? parsed.actions : [])
    .map((action) => {
      const control = input.controls.find((item) => item.id === text(action?.id, 40));
      if (!control) return null;
      const raw = action.value;
      if (control.kind === 'button') return { id: control.id };
      if (control.kind === 'toggle') {
        const on = typeof raw === 'boolean' ? raw : /^(true|yes|on|haan)$/i.test(text(raw, 10)) ? true : /^(false|no|off|nahi)$/i.test(text(raw, 10)) ? false : null;
        return on === null ? null : { id: control.id, value: on };
      }
      if (control.kind === 'select') {
        const value = pickName(control.options || [], raw);
        return value ? { id: control.id, value } : null;
      }
      if (control.kind === 'number') {
        const value = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
        return Number.isFinite(value) && String(raw ?? '').trim() ? { id: control.id, value } : null;
      }
      const value = text(raw, 300);
      return value ? { id: control.id, value } : null;
    })
    .filter((action) => action && !(input.audio && action.id === 'publish_now'))
    .slice(0, 4);

  const canSaveDetails = input.details && (input.stage === 'details' || Object.keys(details).length);
  let detailsDone = canSaveDetails && ['save', 'skip'].includes(parsed.detailsDone) ? parsed.detailsDone : null;
  // A detail said with the card closed is saved in the same turn (the app opens the card, fills and saves it).
  if (!detailsDone && input.details && !input.details.open && Object.keys(details).length) detailsDone = 'save';
  // A clip can be misheard (and holds the helper's own voice): it may open the review, never post.
  let publish = ['open', 'confirm', 'cancel'].includes(parsed.publish)
    ? (input.audio && parsed.publish === 'confirm' ? 'open' : parsed.publish)
    : null;
  let finalReply = reply;
  let finalActions = actions;
  // No review and no posting while the item's company or model is unknown: ask for them instead.
  const unknown = emptyIdentity(input.details, details);
  if (unknown.length && (publish === 'open' || publish === 'confirm' || actions.some((action) => action.id === 'publish_now'))) {
    // An open review closes so the answer can go into the details card.
    publish = input.stage === 'publish' ? 'cancel' : null;
    finalActions = actions.filter((action) => action.id !== 'publish_now');
    finalReply = `${switching ? `${TO_HINDI} ` : ''}${lines[unknown.length > 1 ? 'both' : unknown[0]]}`;
  } else if (emptyIdentity(input.details).length > unknown.length && (publish === 'confirm' || actions.some((action) => action.id === 'publish_now'))) {
    // Company or model only just said: they are saved first, and the seller gives one more OK to post.
    publish = input.stage === 'publish' ? 'cancel' : null;
    finalActions = actions.filter((action) => action.id !== 'publish_now');
    finalReply = `${switching ? `${TO_HINDI} ` : ''}${lines.added}`;
  }
  return {
    reply: finalReply,
    set,
    descriptionAdd: text(parsed.descriptionAdd, 200),
    details,
    check,
    actions: finalActions,
    detailsDone,
    publish,
    stop: parsed.stop === true,
    language,
    heard: input.audio ? text(parsed.heard, 400) : '',
  };
}

async function sellVoiceTurn(body, { userId = '' } = {}) {
  const input = cleanInput(body);
  const { audio, ...prompt } = input;
  const parts = [{ text: JSON.stringify(prompt) }];
  if (audio) parts.push({ inlineData: { mimeType: 'audio/wav', data: audio } });
  const { result } = await runGemini(
    (generationConfig) => ({
      systemInstruction: { parts: [{ text: INSTRUCTION }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { ...generationConfig, temperature: 0.4, maxOutputTokens: 1024, responseMimeType: 'application/json' },
    }),
    (raw) => cleanTurn(raw, input),
    {
      purpose: 'voice',
      userId,
      level: '',
      preferBulk: true,
      quick: true,
      deadlineMs: 15 * 1000,
      onBlocked: () => ({ ...EMPTY_TURN, reply: LINES[input.language].blocked, language: input.language }),
    }
  );
  return result;
}

module.exports = { sellVoiceTurn, cleanInput, cleanTurn };
