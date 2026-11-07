/**
 * Item-specific details buyers ask about (RAM for a phone, kilometres for a bike).
 * The AI names the item kind; the app asks the seller for the missing ones and writes them
 * into the description as "- Label: value" lines.
 */

const YES_NO = ['Yes', 'No'];
const OWNERS = ['1st owner', '2nd owner', '3rd owner or more'];
const BLUEBOOK = ['Renewed', 'Due', 'Not available'];
const PHONE_RAM = ['2 GB', '3 GB', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB'];
const PHONE_STORAGE = ['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB'];
const PC_RAM = ['4 GB', '8 GB', '16 GB', '32 GB', '64 GB'];
const PC_STORAGE = ['256 GB SSD', '512 GB SSD', '1 TB SSD', '1 TB HDD', '2 TB HDD'];
const BOX = ['Full box', 'Charger only', 'Device only'];

const year = { key: 'year', label: 'Make year', unit: '', numeric: true, placeholder: 'e.g. 2021' };
const km = { key: 'km', label: 'Kilometres driven', unit: 'km', numeric: true, placeholder: 'e.g. 15000' };
const engine = { key: 'engine', label: 'Engine', unit: 'cc', numeric: true, placeholder: 'e.g. 150' };
const owners = { key: 'owners', label: 'Ownership', options: OWNERS };
const bluebook = { key: 'bluebook', label: 'Bluebook / tax', options: BLUEBOOK };
const age = { key: 'age', label: 'Used for', placeholder: 'e.g. 2 years' };
const battery = { key: 'battery', label: 'Battery health', unit: '%', numeric: true, placeholder: 'e.g. 89' };
const processor = { key: 'processor', label: 'Processor', placeholder: 'e.g. Intel i5 11th Gen' };
const graphics = { key: 'graphics', label: 'Graphics', placeholder: 'e.g. Integrated, RTX 3050' };
// Kinds sold by company and model have these two first; the voice helper asks for them before posting.
const company = { key: 'company', label: 'Company', placeholder: 'e.g. Samsung' };
const model = { key: 'model', label: 'Model', placeholder: 'e.g. Galaxy A52' };
const IDENTITY_KEYS = [company.key, model.key];

const KINDS = {
  mobile: {
    label: 'Mobile',
    fields: [
      company,
      model,
      { key: 'ram', label: 'RAM', options: PHONE_RAM },
      { key: 'storage', label: 'Storage', options: PHONE_STORAGE },
      battery,
      { key: 'box', label: 'In the box', options: BOX },
      { key: 'warranty', label: 'Warranty', options: ['Under warranty', 'No warranty'] },
    ],
  },
  tablet: {
    label: 'Tablet',
    fields: [
      company,
      model,
      { key: 'ram', label: 'RAM', options: PHONE_RAM },
      { key: 'storage', label: 'Storage', options: PHONE_STORAGE },
      { key: 'network', label: 'Connectivity', options: ['Wi-Fi', 'Wi-Fi + SIM'] },
      battery,
      { key: 'box', label: 'In the box', options: BOX },
    ],
  },
  laptop: {
    label: 'Laptop',
    fields: [
      company,
      model,
      processor,
      { key: 'ram', label: 'RAM', options: PC_RAM },
      { key: 'storage', label: 'Storage', options: PC_STORAGE },
      graphics,
      { key: 'screen', label: 'Screen size', options: ['13 inch', '14 inch', '15.6 inch', '16 inch', '17 inch'] },
      { key: 'backup', label: 'Battery backup', placeholder: 'e.g. 3 hours' },
    ],
  },
  desktop: {
    label: 'Desktop',
    fields: [
      company,
      model,
      processor,
      { key: 'ram', label: 'RAM', options: PC_RAM },
      { key: 'storage', label: 'Storage', options: PC_STORAGE },
      graphics,
      { key: 'monitor', label: 'Monitor included', options: YES_NO },
    ],
  },
  tv: {
    label: 'TV',
    fields: [
      company,
      model,
      { key: 'screen', label: 'Screen size', options: ['24 inch', '32 inch', '43 inch', '50 inch', '55 inch', '65 inch'] },
      { key: 'type', label: 'TV type', options: ['Smart TV', 'Android TV', 'Non-smart'] },
      { key: 'resolution', label: 'Resolution', options: ['HD', 'Full HD', '4K'] },
      { key: 'remote', label: 'Remote included', options: YES_NO },
      age,
    ],
  },
  camera: {
    label: 'Camera',
    fields: [
      company,
      model,
      { key: 'type', label: 'Camera type', options: ['DSLR', 'Mirrorless', 'Point and shoot', 'Action camera'] },
      { key: 'lens', label: 'Lens', placeholder: 'e.g. 18-55mm kit lens' },
      { key: 'shutter', label: 'Shutter count', numeric: true, placeholder: 'e.g. 12000' },
      { key: 'extras', label: 'Accessories', placeholder: 'e.g. Bag, 2 batteries, charger' },
    ],
  },
  motorcycle: {
    label: 'Motorcycle',
    fields: [company, model, engine, km, year, { key: 'mileage', label: 'Mileage', unit: 'km/l', numeric: true, placeholder: 'e.g. 40' }, owners, bluebook],
  },
  scooter: {
    label: 'Scooter',
    fields: [company, model, engine, km, year, { key: 'mileage', label: 'Mileage', unit: 'km/l', numeric: true, placeholder: 'e.g. 45' }, owners, bluebook],
  },
  car: {
    label: 'Car',
    fields: [
      company,
      model,
      year,
      km,
      { key: 'fuel', label: 'Fuel', options: ['Petrol', 'Diesel', 'Electric', 'Hybrid'] },
      { key: 'transmission', label: 'Transmission', options: ['Manual', 'Automatic'] },
      engine,
      owners,
      bluebook,
    ],
  },
  bicycle: {
    label: 'Bicycle',
    fields: [
      { key: 'type', label: 'Cycle type', options: ['Mountain', 'Road', 'Hybrid', 'Kids', 'Electric'] },
      { key: 'gears', label: 'Gears', options: ['Single speed', '7 speed', '21 speed', '24 speed'] },
      { key: 'frame', label: 'Frame size', placeholder: 'e.g. 26 inch' },
      age,
    ],
  },
  fridge: {
    label: 'Refrigerator',
    fields: [
      company,
      model,
      { key: 'capacity', label: 'Capacity', unit: 'litres', numeric: true, placeholder: 'e.g. 250' },
      { key: 'doors', label: 'Doors', options: ['Single door', 'Double door', 'Side by side'] },
      { key: 'inverter', label: 'Inverter', options: YES_NO },
      age,
    ],
  },
  washing_machine: {
    label: 'Washing machine',
    fields: [
      company,
      model,
      { key: 'capacity', label: 'Capacity', unit: 'kg', numeric: true, placeholder: 'e.g. 7' },
      { key: 'type', label: 'Type', options: ['Front load', 'Top load', 'Semi automatic'] },
      age,
    ],
  },
  gadget: {
    label: 'Electronics',
    fields: [company, model, age, { key: 'warranty', label: 'Warranty', options: ['Under warranty', 'No warranty'] }],
  },
  appliance: {
    label: 'Appliance',
    fields: [company, model, age, { key: 'warranty', label: 'Warranty', options: ['Under warranty', 'No warranty'] }],
  },
};

/** Prompt lines teaching the AI the kinds and their field keys. */
function detailPromptLines() {
  return [
    'Details rules:',
    '- details.kind: exactly one of ' +
      Object.keys(KINDS).map((kind) => `"${kind}"`).join(', ') +
      ', or "" when the item is none of these.',
    '  "gadget": other branded electronics (speaker, headphones, smartwatch, printer, router, console).',
    '  "appliance": other branded home appliances (AC, microwave, mixer, fan, water purifier, iron, geyser).',
    '- details.values: field key to value, only for facts you can read on the item or its box, or that',
    '  you stated in the description. Never guess a spec. {} when nothing is known.',
    '- company and model: the maker and model you named in the title or can read on the item, e.g.',
    '  "Samsung" and "Galaxy A52"; "" when you are not sure. Keys per kind:',
    ...Object.entries(KINDS).map(([kind, def]) => `  ${kind}: ${def.fields.map((field) => field.key).join(', ')}`),
  ];
}

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
const squash = (value) => value.replace(/\s+/g, '').toLowerCase();

/** The form for the AI's item kind, with what it already knows; null for other items. */
function detailsFor(raw) {
  const kind = String(raw?.kind || '').trim().toLowerCase();
  const def = KINDS[kind];
  if (!def) return null;
  const values = raw?.values && typeof raw.values === 'object' ? raw.values : {};
  return {
    kind,
    label: def.label,
    fields: def.fields.map((field) => {
      let value = clean(values[field.key]);
      if (field.options && value) value = field.options.find((option) => squash(option) === squash(value)) || value;
      if (field.numeric) value = (value.match(/\d+(\.\d+)?/) || [''])[0];
      return {
        key: field.key,
        label: field.label,
        ...(field.options ? { options: field.options } : {}),
        ...(field.unit ? { unit: field.unit } : {}),
        ...(field.numeric ? { numeric: true } : {}),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        value,
      };
    }),
  };
}

module.exports = { detailPromptLines, detailsFor, IDENTITY_KEYS };
