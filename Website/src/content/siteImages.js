/**
 * Illustration slots on the public site. Drop the generated file into
 * Website/public/images/site/ as `<key>.webp` (or `<key>.png`) and the slot fills itself.
 * Sizes match what ChatGPT image generation outputs, so nothing needs cropping.
 */

export const IMAGE_DIR = '/images/site';

const STYLE = [
  'Soft 3D claymorphism illustration: matte clay material, rounded puffy shapes, gentle studio light from the top-left, soft ambient-occlusion shadows.',
  'Palette led by emerald green #047857 and #10B981 with mint #A7F3D0, warm cream #F7F4EC and soft slate #E8EDF3; small accents of apricot #FDBA74, coral #FB7185 and lavender #C4B5FD.',
  'Set in Nepal where it fits (Kathmandu brick houses, pagoda roofs, prayer flags); any people are Nepali with South Asian features in casual modern clothes.',
  'Friendly, modern, uncluttered. No text, letters, numbers, logos or watermark anywhere.',
].join(' ');

const ON_TRANSPARENT = 'Isolated on a fully transparent background (PNG with alpha): no floor, no backdrop, only a soft contact shadow under the objects.';
const ON_SLAB = 'It will sit on a deep emerald green background, so keep the objects bright (cream, white, mint, apricot, coral) for contrast.';
const ON_BACKDROP = 'Background: smooth soft gradient from #EEF5F1 to #E8EDF3 with empty margin around the subject so it can be shown inside a rounded frame.';

const SQUARE = [1024, 1024];
const LANDSCAPE = [1536, 1024];

export const SITE_IMAGES = {
  'home-hero': {
    page: 'Home — hero, right side',
    size: SQUARE,
    backdrop: 'slab',
    alt: 'A phone showing nearby items for sale, with a scooter, chair, laptop and chat bubbles around it',
    subject: 'A friendly 3D clay smartphone standing slightly tilted, its screen showing a simple marketplace feed of rounded product cards. Floating close around it: a red scooter, a wooden chair, headphones, a laptop, a guitar, a green map pin, a chat bubble with three dots and a small stack of Nepali rupee notes. Compact, centered composition.',
  },
  'home-nearby': {
    page: 'Home — "Nearby first" row',
    size: LANDSCAPE,
    backdrop: 'frame',
    alt: 'Map of a Kathmandu neighbourhood with item pins near the buyer',
    subject: 'Isometric clay diorama of a Kathmandu neighbourhood seen from above: small brick houses, a pagoda temple roof, a little white stupa, trees and curvy roads. Five emerald map pins rise above different houses, each with a small rounded product icon floating over it (phone, sofa, bicycle, camera, books). Dotted circular radius rings spread from a blue "you are here" dot in the middle.',
  },
  'home-chat': {
    page: 'Home — "Chat in the app" row',
    size: LANDSCAPE,
    backdrop: 'frame',
    alt: 'A buyer and a seller chatting on their phones',
    subject: 'Two young Nepali people, a woman and a man, each holding a clay smartphone, standing a little apart and smiling. Between them float big rounded chat bubbles in emerald and white, a small price-tag shape and a handshake icon. Warm, friendly mood.',
  },
  'home-meetup': {
    page: 'Home — "Meet and deal" row',
    size: LANDSCAPE,
    backdrop: 'frame',
    alt: 'A buyer and seller meeting at a busy café in Kathmandu',
    subject: 'A buyer and a seller meeting at a busy, safe public place in Kathmandu: a bright café terrace in front of a shopping mall with prayer flags strung above. The seller hands over a boxed smartphone while the buyer holds up their own phone showing a payment tick. A few other people in the background, daylight, welcoming.',
  },
  'home-sellers': {
    page: 'Home — seller banner',
    size: LANDSCAPE,
    backdrop: 'frame',
    alt: 'A person selling a guitar from home next to a small electronics shop',
    subject: 'Split scene joined by a soft dotted path. Left: a young person at home photographing a used guitar with their phone to sell it. Right: a small Nepali mobile and electronics shopfront with a striped awning, the shopkeeper smiling at the counter and a green verified-badge shape floating above the roof.',
  },
  'home-download': {
    page: 'Home — download banner',
    size: SQUARE,
    backdrop: 'slab',
    alt: 'A hand holding a phone with the KinBech app open',
    subject: 'A hand holding a clay smartphone showing a clean marketplace app screen with rounded product cards and a green bottom bar. Around the phone float small icons: a map pin, a chat bubble, a heart, a star and a shield.',
  },

  'features-hero': {
    page: 'Features — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'Floating icons for location, chat, shop, wishlist, reviews and safety',
    subject: 'A loose arc of floating clay feature icons: a big map pin, a chat bubble, a small shopfront, a heart, a star rating badge and a shield with a check mark, with little sparkles between them.',
  },
  'features-local': {
    page: 'Features — "Why local beats shipping" card',
    size: LANDSCAPE,
    backdrop: 'frame',
    alt: 'Meeting the seller the same day compared with waiting for a courier',
    subject: 'Comparison scene split down the middle by a soft line. Left, bright and cheerful: two people at a market stall inspecting a phone together. Right, muted grey tones: a pile of cardboard courier boxes, a small delivery van, a calendar and a clock suggesting days of waiting.',
  },

  'how-hero': {
    page: 'How it works — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'Four stepping stones from sign-up to a handshake',
    subject: 'A playful clay path of four round stepping stones rising from left to right, each carrying one object: a smartphone with a small lock, a magnifying glass, a chat bubble, and two hands shaking. Tiny flags and sparkles along the path.',
  },
  'how-after-meet': {
    page: 'How it works — "After you meet" card',
    size: LANDSCAPE,
    backdrop: 'frame',
    alt: 'A buyer testing a phone before paying the seller',
    subject: 'At a café table in a busy public place, a buyer carefully tests a smartphone while the seller watches. On the table: another phone showing a QR wallet payment and a small stack of rupee notes. A five-star review bubble floats above them.',
  },

  'sellers-hero': {
    page: 'For sellers — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'A small shopfront with products and a verified badge',
    subject: 'A small clay storefront with a striped awning and an open door, a smartphone leaning beside it showing a product card, a cardboard box of items, a few price tags and a green verified badge floating above the roof.',
  },
  'sellers-individual': {
    page: 'For sellers — Individual card',
    size: LANDSCAPE,
    backdrop: 'frame',
    alt: 'A young woman photographing a lamp and books to sell',
    subject: 'Cozy room: a young Nepali woman sits on a floor cushion photographing a used table lamp and a stack of books with her phone to post them for sale. A small price tag floats above. Light lavender accents.',
  },
  'sellers-shop': {
    page: 'For sellers — Shop owner card',
    size: LANDSCAPE,
    backdrop: 'frame',
    alt: 'A shopkeeper at an electronics counter with a verified badge',
    subject: 'A small Nepali electronics shop counter: a shopkeeper arranging phones and earbuds on shelves, an open laptop showing a product grid, and a green verified badge with star-rating shapes floating above. Light mint accents.',
  },

  'safety-hero': {
    page: 'Safety — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'A shield with a lock, map pin and phone around it',
    subject: 'A big friendly clay shield with a check mark in the middle, surrounded by a padlock, a map pin over a busy building, an eye, a smartphone with a chat bubble and a small police-booth kiosk.',
  },
  'safety-red-flags': {
    page: 'Safety — "Red flags" card',
    size: SQUARE,
    backdrop: 'frame',
    alt: 'A phone showing a warning, with a hand saying stop',
    subject: 'A smartphone with a big chat bubble showing a warning triangle, a hand raised in a "stop" gesture in front of it, a cracked padlock and a fishing hook pulling at a bank-card shape — scams to avoid. Amber and coral accents.',
  },

  'faq-hero': {
    page: 'FAQ — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'Question marks and speech bubbles',
    subject: 'Large rounded clay question marks and speech bubbles of different sizes floating together: one bubble with three dots, one with a light bulb, plus a small lifebuoy ring and a headset.',
  },
  'faq-support': {
    page: 'FAQ — "Still need help" card',
    size: LANDSCAPE,
    backdrop: 'transparent',
    alt: 'A friendly support agent waving from a desk',
    subject: 'A friendly clay support agent with a headset, waving, sitting at a small rounded desk with a laptop; a chat bubble with a heart floats above.',
  },

  'download-hero': {
    page: 'Download — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'Two phones showing the KinBech app',
    subject: 'Two clay smartphones standing side by side at slight angles, one showing a grid of product cards and the other a chat screen, with a download-arrow badge, a map pin and a star floating around them.',
  },

  'categories-hero': {
    page: 'Categories — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'Phones, a sofa, a scooter, clothes and other items',
    subject: 'A neat floating collage of everyday second-hand items as clay toys: smartphone, laptop, sofa, scooter, a kurta on a hanger, guitar, cricket bat, a basket of vegetables, a stack of books and a pressure cooker.',
  },

  'legal-hero': {
    page: 'Legal hub and every legal document — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'A document with a seal, a padlock and a shield',
    subject: 'A clay document with a folded corner and a round seal, a padlock, a shield with a check mark, a magnifying glass and a small balance scale, arranged calmly.',
  },
  'security-hero': {
    page: 'Report a security issue and Human check — page header',
    size: LANDSCAPE,
    backdrop: 'slab',
    alt: 'A bug under a magnifying glass next to a shield',
    subject: 'A cute clay bug character caught under a magnifying glass, next to a shield with a padlock and a small laptop showing a warning triangle.',
  },

  'explore-empty': {
    page: 'Explore, seller profile — "nothing found" states',
    size: SQUARE,
    backdrop: 'transparent',
    alt: '',
    subject: 'A cute clay magnifying glass peeking into an empty cardboard box, a few small sparkles and a sleepy little cloud above — a gentle "nothing found" scene.',
  },
};

const BACKDROP_TEXT = {
  slab: `${ON_TRANSPARENT} ${ON_SLAB}`,
  transparent: ON_TRANSPARENT,
  frame: ON_BACKDROP,
};

export function imagePrompt(key) {
  const image = SITE_IMAGES[key];
  if (!image) return '';
  const [width, height] = image.size;
  const shape = width === height ? 'square' : width > height ? 'landscape' : 'portrait';
  return `${image.subject} ${STYLE} ${BACKDROP_TEXT[image.backdrop]} Output: ${width}×${height} ${shape}.`;
}
