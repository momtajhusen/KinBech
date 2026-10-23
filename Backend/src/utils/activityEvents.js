/**
 * Single source of truth for admin "Live Activity" event shapes.
 *
 * Every builder returns a flat event object. The same builders feed both the
 * REST snapshot (`getLiveActivity`) and the Socket.IO stream (`emitActivity`),
 * so the admin UI renders identical payloads regardless of transport.
 */

const LIVE_ACTIVITY_TYPES = ['user', 'listing', 'shop', 'report', 'review', 'ticket', 'error', 'alert'];

function pushDetail(list, label, value) {
  if (value === null || value === undefined || value === '') return;
  list.push({ label, value: String(value) });
}

function money(value) {
  return value != null && value !== '' ? `NPR ${Number(value).toLocaleString()}` : '';
}

function userActivityEvent(u) {
  const details = [];
  pushDetail(details, 'Location', u.location);
  pushDetail(details, 'Profile', u.profileComplete ? 'complete' : 'incomplete');
  pushDetail(details, 'Phone', u.phone);

  return {
    id: `user-${u._id}`,
    type: 'user',
    title: 'New user signed up',
    message: u.name || u.phone || 'New account',
    actor: u.name || u.phone || 'User',
    meta: u.location || (u.profileComplete ? '' : 'profile incomplete'),
    details,
    severity: 'info',
    time: u.createdAt,
    link: '/admin/users',
  };
}

function listingActivityEvent(l) {
  const details = [];
  pushDetail(details, 'Category', l.category || 'Uncategorised');
  pushDetail(details, 'Price', money(l.price));
  pushDetail(details, 'Status', l.status);
  pushDetail(details, 'Seller', l.sellerType === 'shop' ? 'Shop' : 'Individual');

  return {
    id: `listing-${l._id}`,
    type: 'listing',
    title: `New listing · ${l.category || 'Uncategorised'}`,
    message: l.title,
    actorId: l.seller,
    actor: l.sellerType === 'shop' ? 'Shop' : 'Individual',
    meta: money(l.price),
    details,
    severity: l.status === 'pending' ? 'warning' : 'info',
    time: l.createdAt,
    link: '/admin/listings',
  };
}

function shopActivityEvent(s) {
  const details = [];
  pushDetail(details, 'Category', s.category);
  pushDetail(details, 'Status', s.status);
  pushDetail(details, 'Verification', s.isVerified ? 'verified' : 'pending');
  pushDetail(details, 'Location', s.location);

  return {
    id: `shop-${s._id}`,
    type: 'shop',
    title: s.isVerified ? 'Shop active' : 'Shop awaiting verification',
    message: s.name,
    actorId: s.owner,
    actor: s.name || 'Shop',
    meta: s.status || '',
    details,
    severity: s.isVerified ? 'info' : 'warning',
    time: s.createdAt,
    link: '/admin/shops',
  };
}

function reportActivityEvent(r) {
  const details = [];
  pushDetail(details, 'Reason', r.reason || 'other');
  pushDetail(details, 'Status', r.status);
  pushDetail(details, 'On listing', r.reportedListing ? 'yes' : 'no');

  return {
    id: `report-${r._id}`,
    type: 'report',
    title: `Report · ${r.reason || 'other'}`,
    message: r.details || 'A user report needs review',
    actorId: r.reporter,
    actor: 'Reporter',
    meta: r.status || '',
    details,
    severity: r.status === 'pending' ? 'danger' : 'warning',
    time: r.createdAt,
    link: '/admin/reports',
  };
}

function reviewActivityEvent(rv) {
  const details = [];
  pushDetail(details, 'Rating', rv.rating != null ? `${rv.rating} / 5` : '');
  pushDetail(details, 'Status', rv.status);
  pushDetail(details, 'Tags', Array.isArray(rv.tags) && rv.tags.length ? rv.tags.join(', ') : '');

  return {
    id: `review-${rv._id}`,
    type: 'review',
    title: `New review · ${rv.rating}★`,
    message: rv.review || 'No comment left',
    actorId: rv.reviewer,
    actor: 'Reviewer',
    meta: rv.status || '',
    details,
    severity: rv.status === 'pending' ? 'warning' : 'info',
    time: rv.createdAt,
    link: '/admin/reviews',
  };
}

function ticketActivityEvent(t) {
  const details = [];
  pushDetail(details, 'Status', t.status || 'open');
  pushDetail(details, 'Phone', t.phone);
  pushDetail(details, 'Requester', t.name);

  return {
    id: `ticket-${t._id}`,
    type: 'ticket',
    title: `Support ticket · ${t.status || 'open'}`,
    message: t.subject,
    actorId: t.user,
    actor: t.name || 'Guest',
    meta: t.phone || '',
    details,
    severity: t.status === 'open' ? 'warning' : 'info',
    time: t.createdAt,
    link: null,
  };
}

function errorActivityEvent(e) {
  const details = [];
  pushDetail(details, 'Source', e.source || 'backend');
  pushDetail(details, 'Path', e.path);
  pushDetail(details, 'Occurrences', `${e.occurrenceCount || 1}x`);
  pushDetail(details, 'Status code', e.statusCode);
  pushDetail(details, 'Status', e.status);

  return {
    id: `error-${e._id}`,
    type: 'error',
    title: `Error · ${e.source || 'backend'}`,
    message: e.message,
    actor: e.userLabel || '',
    meta: `${e.path || ''} · ${e.occurrenceCount || 1}x`.trim(),
    details,
    severity: e.severity === 'fatal' ? 'danger' : 'error',
    time: e.lastSeenAt || e.createdAt,
    link: '/admin/error-log',
  };
}

function alertActivityEvent(a) {
  const details = [];
  pushDetail(details, 'Type', a.type);
  pushDetail(details, 'Metric', a.metricValue);
  pushDetail(details, 'Baseline', a.baselineValue);
  pushDetail(details, 'Status', a.status);

  return {
    id: `alert-${a._id}`,
    type: 'alert',
    title: a.title,
    message: a.message,
    meta: a.changePct != null ? `${a.changePct > 0 ? '+' : ''}${a.changePct}%` : '',
    details,
    severity: 'danger',
    time: a.createdAt,
    link: '/admin/dashboard',
  };
}

module.exports = {
  LIVE_ACTIVITY_TYPES,
  userActivityEvent,
  listingActivityEvent,
  shopActivityEvent,
  reportActivityEvent,
  reviewActivityEvent,
  ticketActivityEvent,
  errorActivityEvent,
  alertActivityEvent,
};
