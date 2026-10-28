/**
 * Success wording for admin actions, keyed by HTTP method + API path.
 * A rule returns a sentence, or SILENT when the page shows its own result (or none is needed).
 */
export const SILENT = Symbol('silent');

const LISTING = { active: 'Listing approved and live', rejected: 'Listing rejected, seller notified', removed: 'Listing removed' };
const REPORT = { dismissed: 'Report dismissed', reviewed: 'Report marked as action taken', resolved: 'Report resolved' };
const REVIEW = { approved: 'Review kept', rejected: 'Review removed' };
const USER_STATUS = { suspend: 'User suspended', reinstate: 'User reinstated' };
const MODERATE = {
  suspend: 'Account suspended',
  reinstate: 'Account reinstated',
  restrict_chat: 'Chat restricted',
  lift_chat: 'Chat lock lifted',
  force_logout: 'User signed out of every device',
  set_credits: 'Featured credits saved',
  set_post_limits: 'Post limits saved',
};
const ERROR_STATUS = { acknowledged: 'Error acknowledged', resolved: 'Error marked resolved', ignored: 'Error ignored', open: 'Error reopened' };

const words = (value) => String(value || '').replace(/_/g, ' ');

const RULES = [
  // Sign-in, chat and calls report their own result or need none.
  ['*', /^\/auth\/(admin\/login|logout|refresh)/, () => SILENT],
  ['post', /^\/auth\/logout-all$/, () => SILENT],
  ['post', /^\/auth\/admin\/2fa\/setup$/, () => SILENT],
  ['post', /^\/chats\//, (body, data, url) => (url.endsWith('/notify') ? 'Notification sent' : SILENT)],
  ['post', /\/test$/, () => SILENT],
  ['post', /^\/errors(\/|$)/, () => SILENT],

  ['patch', /^\/listings\/admin\/[^/]+\/status$/, (b) => LISTING[b.status] || `Listing marked ${words(b.status)}`],
  ['patch', /^\/reports\/admin\/[^/]+\/status$/, (b) => REPORT[b.status] || 'Report updated'],
  ['patch', /^\/reviews\/admin\/[^/]+\/status$/, (b) => REVIEW[b.status] || 'Review updated'],
  ['patch', /^\/shops\/admin\/[^/]+\/status$/, (b) => (b.isVerified ? 'Shop approved and verified' : b.status === 'suspended' ? 'Shop suspended' : 'Shop updated')],
  ['post', /^\/shops\/admin\/[^/]+\/verification$/, () => 'Shop verification saved'],

  ['patch', /^\/auth\/admin\/users\/[^/]+\/status$/, (b) => USER_STATUS[b.action] || 'User updated'],
  ['post', /^\/auth\/admin\/users\/[^/]+\/moderate$/, (b, d) => d.summary || MODERATE[b.action] || 'User updated'],
  ['post', /^\/auth\/admin\/deletions\/[^/]+\/cancel$/, () => 'Account deletion cancelled'],
  ['patch', /^\/auth\/admin\/support-tickets\//, (b) => (b.reply ? 'Reply sent, ticket resolved' : b.status === 'resolved' ? 'Ticket resolved' : b.status === 'open' ? 'Ticket reopened' : 'Ticket updated')],
  ['patch', /^\/auth\/admin\/platform-alerts\//, () => 'Alert acknowledged'],
  ['post', /^\/auth\/admin\/testers\//, () => 'Tester settings updated'],
  ['delete', /^\/auth\/admin\/testers\//, () => 'Tester deleted'],

  ['put', /^\/auth\/admin\/settings$/, () => 'Settings saved'],
  ['post', /^\/auth\/admin\/create$/, () => 'Admin invited'],
  ['post', /^\/auth\/admin\/[^/]+\/reset-2fa$/, () => 'Two-step verification reset'],
  ['patch', /^\/auth\/admin\/[^/]+$/, () => 'Admin updated'],
  ['delete', /^\/auth\/admin\/[^/]+$/, () => 'Admin removed'],
  ['post', /^\/auth\/admin\/2fa\/enable$/, () => 'Two-step verification is on'],
  ['post', /^\/auth\/admin\/2fa\/disable$/, () => 'Two-step verification is off'],
  ['post', /^\/auth\/admin\/2fa\/backup-codes$/, () => 'New backup codes created'],
  ['post', /^\/auth\/admin\/change-password$/, () => 'Password changed'],
  ['delete', /^\/auth\/sessions\//, () => 'Device signed out'],

  ['post', /^\/moderation\/trust\/sellers\/[^/]+\/strike$/, () => 'Strike added'],
  ['patch', /^\/moderation\/trust\/sellers\/[^/]+\/override$/, (b) => (b.score === null ? 'Score override cleared' : 'Trust score overridden')],
  ['post', /^\/moderation\/trust\/recompute$/, (b, d) => (d.count != null ? `Scored ${d.count} sellers` : 'Seller scores recomputed')],
  ['put', /^\/moderation\/trust\/settings$/, () => 'Trust settings saved'],
  ['post', /^\/moderation\/scam\/[^/]+\/action$/, () => 'Action applied to the flagged chat'],
  ['patch', /^\/moderation\/scam\/[^/]+$/, (b) => `Flag marked ${words(b.status)}`],
  ['post', /^\/moderation\/keywords\/admin\/import$/, () => 'Keywords imported'],
  ['post', /^\/moderation\/keywords\/admin$/, () => 'Keyword added'],
  ['patch', /^\/moderation\/keywords\/admin\//, (b) => (Object.keys(b).length === 1 && 'isActive' in b ? (b.isActive ? 'Keyword turned on' : 'Keyword turned off') : 'Keyword updated')],
  ['delete', /^\/moderation\/keywords\/admin\//, () => 'Keyword deleted'],

  ['post', /^\/categories\/admin\/upload$/, () => 'Image uploaded'],
  ['post', /^\/categories\/admin$/, () => 'Category created'],
  ['patch', /^\/categories\/admin\//, () => 'Category updated'],
  ['delete', /^\/categories\/admin\//, () => 'Category deleted'],

  ['post', /^\/notifications\/admin\/broadcast$/, (b) => (b.saveAsDraft ? 'Draft saved' : 'Notification sent')],
  ['delete', /^\/notifications\/admin\/broadcasts\//, () => 'Draft deleted'],

  ['patch', /^\/errors\/admin\//, (b) => ERROR_STATUS[b.status] || 'Error updated'],

  ['post', /^\/subscriptions\/admin\/plans$/, () => 'Plan created'],
  ['put', /^\/subscriptions\/admin\/plans\//, () => 'Plan updated'],
  ['delete', /^\/subscriptions\/admin\/plans\//, () => 'Plan deleted'],
  ['post', /^\/subscriptions\/admin\/requests\/[^/]+\/approve$/, () => 'Plan activated for the seller'],
  ['post', /^\/subscriptions\/admin\/requests\/[^/]+\/reject$/, () => 'Request rejected'],
  ['put', /^\/subscriptions\/admin\/payment$/, () => 'Payment details saved'],
  ['put', /^\/subscriptions\/admin\/gateway\/esewa$/, () => 'eSewa settings saved'],
  ['post', /^\/subscriptions\/admin\/gateway\/esewa\/sandbox-defaults$/, () => 'eSewa test credentials restored'],

  ['post', /^\/calls\/admin\/accounts$/, () => 'Call account added'],
  ['put', /^\/calls\/admin\/accounts$/, () => 'Call accounts saved'],
  ['put', /^\/calls\/admin\/accounts\/[^/]+\/credentials$/, () => 'Call credentials updated'],
  ['post', /^\/calls\/admin\/accounts\/[^/]+\/clear-limit$/, (b) => (b.resetUsage ? 'Minutes reset' : 'Limit cleared')],
  ['put', /^\/calls\/admin\/settings$/, () => 'Call settings saved'],

  ['put', /^\/ai\/admin\/models$/, () => 'AI settings saved'],
  ['put', /^\/ai\/admin\/accounts$/, () => 'AI accounts saved'],
  ['post', /^\/ai\/admin\/accounts$/, () => 'AI account added'],
  ['post', /^\/ai\/admin\/accounts\/[^/]+\/clear-limit$/, () => 'Limit cleared'],
  ['put', /^\/ai\/admin\/accounts\/[^/]+\/key$/, () => 'API key updated'],
];

const FALLBACK = { post: 'Done', put: 'Changes saved', patch: 'Changes saved', delete: 'Deleted' };

function parseBody(raw) {
  if (!raw || typeof raw !== 'string') return raw && typeof raw === 'object' && !(raw instanceof FormData) ? raw : {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function findRule(method, path) {
  return RULES.find(([ruleMethod, pattern]) => (ruleMethod === '*' || ruleMethod === method) && pattern.test(path));
}

const cleanPath = (url) => String(url || '').split('?')[0].replace(/^https?:\/\/[^/]+/, '');

/** Sentence for a finished request, or null when nothing should be shown. */
export function successMessage(method, url, rawBody, data = {}) {
  const path = cleanPath(url);
  const rule = findRule(method, path);
  const result = rule ? rule[2](parseBody(rawBody), data || {}, path) : null;
  if (result === SILENT) return null;
  if (typeof data?.message === 'string' && data.message && !rule) return data.message;
  return result || FALLBACK[method] || null;
}

/** False when a failed request should stay quiet (its caller ignores the failure on purpose). */
export function shouldReportError(method, url) {
  const path = cleanPath(url);
  if (/\/call\/end$/.test(path) || /^\/auth\/(logout|logout-all|refresh)/.test(path)) return false;
  if (/^\/auth\/sessions\//.test(path) || /^\/errors(\/|$)/.test(path)) return false;
  return true;
}

const ERROR_TITLES = { 400: 'Check the details', 403: 'Not allowed', 404: 'Not found', 409: 'Already changed', 413: 'Too large', 429: 'Too many tries' };

export function errorTitle(error) {
  const status = error?.response?.status;
  if (!error?.response) return 'Connection problem';
  if (status >= 500) return 'Server error';
  return ERROR_TITLES[status] || 'Action failed';
}

export function errorText(error) {
  if (!error?.response) return "Can't reach the server. Check your internet and try again.";
  return error.response.data?.message || 'Please try again.';
}
