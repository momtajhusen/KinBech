// Checks the sell voice helper's turn cleaning (no AI, no database): `node scripts/test-sell-voice.js`.
const assert = require('assert');
const { cleanInput, cleanTurn } = require('../src/utils/sellVoice');
const { detailsFor } = require('../src/utils/listingDetails');

const phone = (values) => {
  const details = detailsFor({ kind: 'mobile', values });
  return { open: false, label: details.label, fields: details.fields };
};
const body = (extra = {}) => ({
  form: { title: 'Samsung Galaxy phone 128GB black', price: 15000 },
  categories: ['Mobiles'],
  conditions: ['Good'],
  stage: 'form',
  said: 'हो',
  details: phone({ company: 'Samsung', model: 'Galaxy A52' }),
  controls: [{ id: 'publish_now', kind: 'button', label: 'post' }],
  ...extra,
});
const turn = (input, raw) => cleanTurn(JSON.stringify(raw), cleanInput(input));
const POSTING = { reply: 'ठिक छ, पब्लिश गर्दैछु।', publish: 'confirm', actions: [{ id: 'publish_now' }] };

const tests = {
  'a conversation starts in Nepali'() {
    assert.equal(cleanInput(body()).language, 'ne');
    assert.equal(cleanInput(body({ language: 'fr' })).language, 'ne');
    assert.equal(turn(body(), { reply: 'ल, कति पर्छ?' }).language, 'ne');
  },
  'another language: asks for Hindi and switches'() {
    const out = turn(body({ said: 'कीमत पंद्रह हज़ार कर दो' }), { reply: 'हिंदी में मुझसे बात करो। पंद्रह हज़ार रख दिया।', language: 'hi', set: { price: 15000 } });
    assert.equal(out.language, 'hi');
    assert.ok(out.reply.startsWith('हिंदी में मुझसे बात करो'));
    assert.equal(out.set.price, 15000, 'what the seller said was dropped');
  },
  'a switch without the line still says it'() {
    const out = turn(body({ said: 'price fifteen thousand' }), { reply: 'ठीक है, पंद्रह हज़ार।', language: 'hi' });
    assert.equal(out.reply, 'हिंदी में मुझसे बात करो। ठीक है, पंद्रह हज़ार।');
  },
  'the line alone also switches'() {
    assert.equal(turn(body(), { reply: 'हिंदी में मुझसे बात करो।' }).language, 'hi');
  },
  'Hindi stays for the rest of the conversation'() {
    assert.equal(turn(body({ language: 'hi' }), { reply: 'ल, कति पर्छ?', language: 'ne' }).language, 'hi');
    assert.equal(turn(body({ language: 'hi' }), { reply: 'कीमत कितनी है?' }).language, 'hi');
  },
  'an empty clip over the line keeps the language'() {
    const out = turn(body({ language: 'hi', said: '', audio: 'AAAA', speakingOver: 'कीमत कितनी है?' }), { reply: '', heard: '' });
    assert.equal(out.reply, '');
    assert.equal(out.language, 'hi');
  },
  'company and model are details of company-based items'() {
    ['mobile', 'tablet', 'laptop', 'desktop', 'tv', 'camera', 'motorcycle', 'scooter', 'car', 'fridge', 'washing_machine', 'gadget', 'appliance']
      .forEach((kind) => {
        const keys = detailsFor({ kind, values: {} }).fields.map((field) => field.key);
        assert.deepEqual(keys.slice(0, 2), ['company', 'model'], kind);
      });
    const values = detailsFor({ kind: 'gadget', values: { company: 'JBL', model: 'Flip 5' } }).fields;
    assert.equal(values[0].value, 'JBL');
    assert.equal(values[1].value, 'Flip 5');
  },
  'missing company or model is asked before posting (Nepali)'() {
    const input = body({ details: phone({ company: 'Samsung' }) });
    assert.deepEqual(cleanInput(input).missing, ['model']);
    const out = turn(input, POSTING);
    assert.equal(out.publish, null);
    assert.deepEqual(out.actions, []);
    assert.equal(out.reply, 'पब्लिश गर्नुअघि भन्नुहोस्, यसको मोडल कुन हो?');
  },
  'both missing, in Hindi, with the review open: it closes and asks'() {
    const out = turn(body({ language: 'hi', stage: 'publish', details: phone({}) }), POSTING);
    assert.equal(out.publish, 'cancel');
    assert.equal(out.reply, 'पब्लिश करने से पहले बताइए, यह किस कंपनी का है और मॉडल कौन सा है?');
  },
  'company and model just said: saved, one more OK before posting'() {
    const out = turn(body({ details: phone({}) }), { ...POSTING, details: { company: 'Samsung', model: 'Galaxy A52' } });
    assert.equal(out.detailsDone, 'save');
    assert.equal(out.publish, null);
    assert.deepEqual(out.actions, []);
    assert.equal(out.reply, 'ठिक छ, थपें। अब पब्लिश गरिदिऊँ?');
  },
  'known company and model: posts as asked'() {
    const out = turn(body(), POSTING);
    assert.equal(out.publish, 'confirm');
    assert.deepEqual(out.actions, [{ id: 'publish_now' }]);
  },
  'items with no company or model fields are not held back'() {
    const out = turn(body({ details: null }), POSTING);
    assert.equal(out.publish, 'confirm');
  },
  'words from a recording never post'() {
    const out = turn(body({ said: '', audio: 'AAAA' }), { ...POSTING, heard: 'हो पब्लिश गर' });
    assert.equal(out.publish, 'open');
    assert.deepEqual(out.actions, []);
  },
};

let failed = 0;
Object.entries(tests).forEach(([name, run]) => {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}: ${error.message}`);
  }
});
process.exit(failed ? 1 : 0);
