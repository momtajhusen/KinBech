import { AppState } from 'react-native';
import { api } from './api';

const PING_EVERY_MS = 30 * 1000;
const SKIP_SCREENS = new Set(['Splash']);

let enabled = false;
let current = null;
let lastSentKey = '';
let timer = null;
let appState = AppState.currentState;

const idOf = (value) => (value && (value._id || value.id || value.userId)) || '';

/** Screen name plus the few ids admins need to see what is open; never message or form contents. */
function describeRoute(route) {
  const p = route.params || {};
  const params = {};
  switch (route.name) {
    case 'ItemDetail':
    case 'EditListing':
      params.listingId = p.listingId || idOf(p.item);
      break;
    case 'SellerProfile':
      params.sellerId = p.sellerId || idOf(p.seller);
      break;
    case 'ShopProfile':
      params.shopId = p.shopId;
      break;
    case 'Explore':
      params.category = p.category;
      break;
    case 'SearchResults':
      params.query = p.query;
      params.category = p.category || p.title;
      break;
    case 'Chat':
      params.otherUserId = p.otherUserId;
      params.listingId = idOf(p.listing);
      break;
    case 'Call':
      params.listingId = idOf(p.listing);
      break;
    default:
      break;
  }
  Object.keys(params).forEach((key) => {
    if (!params[key]) delete params[key];
    else params[key] = String(params[key]);
  });
  return { screen: route.name, params };
}

function send(event) {
  if (!current) return;
  api.reportPresence({ event, screen: current.screen, params: current.params }).catch(() => {});
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => send('ping'), PING_EVERY_MS);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

const live = () => enabled && appState === 'active';

/** Call with the focused leaf route whenever navigation changes. */
export function trackScreen(route) {
  if (!route || SKIP_SCREENS.has(route.name)) return;
  current = describeRoute(route);
  const key = JSON.stringify(current);
  if (key === lastSentKey) return;
  lastSentKey = key;
  if (live()) send('screen');
}

/** Off for staff (admin panel); on for buyers, sellers and guests. */
export function setPresenceEnabled(on) {
  if (on === enabled) return;
  if (!on && live()) send('leave');
  enabled = on;
  lastSentKey = '';
  if (live()) {
    send('screen');
    startTimer();
  } else {
    stopTimer();
  }
}

AppState.addEventListener('change', (next) => {
  if (next === 'inactive') return;
  const was = live();
  appState = next;
  if (live() && !was) {
    send('screen');
    startTimer();
  } else if (!live() && was) {
    send('leave');
    stopTimer();
  }
});
