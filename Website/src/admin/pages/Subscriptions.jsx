import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Banknote,
  Briefcase,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Gem,
  Leaf,
  Pencil,
  Plus,
  Rocket,
  Search,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  Trophy,
  User,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import api from '../services/api';
import Modal, { ModalSwitch } from '../components/Modal';
import { toast } from '../components/Feedback';
import PromptModal from '../components/PromptModal';
import InfiniteLoader from '../components/InfiniteLoader';
import useInfiniteList from '../utils/useInfiniteList';
import PostLimitStepper, { PostLimitPresets } from '../components/PostLimitStepper';
import EsewaGatewayCard from '../components/EsewaGatewayCard';
import { adminPath } from '../routes';

const STATUSES = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed online' },
];

const METHOD_TONES = { esewa: '#60BB46', khalti: '#5C2D91', ime: '#E31E24', bank: '#2563EB' };

const PAYMENT_FIELDS = [
  { key: 'esewa', label: 'eSewa ID', placeholder: '98XXXXXXXX (KinBech Pvt. Ltd.)' },
  { key: 'khalti', label: 'Khalti ID', placeholder: '98XXXXXXXX' },
  { key: 'ime', label: 'IME Pay', placeholder: '98XXXXXXXX' },
  { key: 'bank', label: 'Bank account', placeholder: 'Bank name · A/C number · Account name', wide: true },
];

const REJECT_PRESETS = [
  'Payment not received',
  'Transaction ID not found',
  'Amount is less than the plan price',
  'This transaction ID was already used',
];

const DURATION_PRESETS = [7, 30, 90, 365];
/** Values are Ionicons names the app draws; '' lets the app pick from the plan type. */
const PLAN_ICONS = [
  { value: '', label: 'Auto', Icon: Sparkles },
  { value: 'flash', label: 'Flash', Icon: Zap },
  { value: 'rocket', label: 'Rocket', Icon: Rocket },
  { value: 'storefront', label: 'Shop', Icon: Store },
  { value: 'star', label: 'Star', Icon: Star },
  { value: 'diamond', label: 'Diamond', Icon: Gem },
  { value: 'trophy', label: 'Trophy', Icon: Trophy },
  { value: 'flame', label: 'Fire', Icon: Flame },
  { value: 'leaf', label: 'Leaf', Icon: Leaf },
  { value: 'briefcase', label: 'Business', Icon: Briefcase },
  { value: 'pricetag', label: 'Tag', Icon: Tag },
];
const SCREEN_FIELDS = [
  { key: 'headerSubtitle', label: 'Header line', max: 60, hint: 'Under “Plans & limits” at the top' },
  { key: 'freePlanName', label: 'Free plan name', max: 30, hint: 'Shown on the current plan card when a seller has no plan' },
  { key: 'sectionTitle', label: 'Plans title', max: 40, hint: 'Above the plan cards' },
  { key: 'sectionNote', label: 'Plans note', max: 120, hint: 'Small line under the plans title', wide: true },
  { key: 'stepsTitle', label: 'Steps title', max: 40, hint: 'Title of the steps card' },
  { key: 'helpText', label: 'Help link text', max: 40, hint: 'Opens Contact us' },
];
const EMPTY_PLAN = {
  name: '',
  tagline: '',
  description: '',
  icon: '',
  badge: '',
  price: 499,
  durationDays: 30,
  individualDailyListings: 20,
  shopDailyListings: null,
  features: '',
  highlight: false,
  active: true,
  sortOrder: 0,
};

const npr = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const dateTime = (value) =>
  value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const dateOnly = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function limitLabel(value, kind) {
  if (value == null) return null;
  return value === 0 ? `Unlimited ${kind}` : `${value} ${kind} / day`;
}

function CopyText({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="subs-copy"
      title="Copy"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
    </button>
  );
}

function RequestCard({ row, onApprove, onReject }) {
  const limits = [limitLabel(row.individualDailyListings, 'individual'), limitLabel(row.shopDailyListings, 'store')].filter(Boolean);
  return (
    <div className={`subs-request status-${row.status}`}>
      <div className="subs-request-main">
        <div className="subs-request-user">
          <span className="subs-avatar">{(row.user?.name || row.user?.phone || '?').slice(0, 1).toUpperCase()}</span>
          <div>
            {row.user ? (
              <Link to={adminPath(`users/${row.user.id}`)} className="subs-user-name">{row.user.name || 'No name'}</Link>
            ) : (
              <span className="subs-user-name">Deleted user</span>
            )}
            <div className="subs-muted">{row.user?.phone}</div>
            {row.user?.currentPlan ? (
              <div className="subs-current">Now on {row.user.currentPlan.name} · {row.user.currentPlan.daysLeft} days left</div>
            ) : null}
          </div>
        </div>

        <div className="subs-request-plan">
          <div className="subs-plan-name">{row.planName}</div>
          <div className="subs-muted">{row.durationDays} days · {limits.join(' · ')}</div>
        </div>

        <div className="subs-request-pay">
          <div className="subs-amount">{npr(row.price)}</div>
          <div className="subs-method">
            <span className="subs-method-dot" style={{ background: METHOD_TONES[row.method] }} />
            {row.methodLabel}
            {row.gateway ? (
              <span className={`subs-gateway ${row.gatewayMode === 'sandbox' ? 'test' : ''}`}>
                {row.gatewayMode === 'sandbox' ? 'Online · test' : 'Paid online'}
              </span>
            ) : null}
          </div>
          <div className="subs-ref">
            <code>{row.gatewayRef || row.reference}</code>
            <CopyText text={row.gatewayRef || row.reference} />
          </div>
          <div className="subs-muted">Bill {row.receiptNo}</div>
        </div>
      </div>

      {row.note ? <div className="subs-note">“{row.note}”</div> : null}

      <div className="subs-request-foot">
        <span className="subs-muted">
          <Clock aria-hidden /> Sent {dateTime(row.createdAt)}
          {row.reviewedAt ? ` · ${row.status} ${dateTime(row.reviewedAt)}${row.reviewedBy ? ` by ${row.reviewedBy}` : ''}` : ''}
        </span>
        {row.status === 'pending' ? (
          <div className="action-buttons">
            <button type="button" className="action-btn suspend" onClick={() => onReject(row)}>
              <XCircle className="item-icon" aria-hidden /> Reject
            </button>
            <button type="button" className="action-btn approve" onClick={() => onApprove(row)}>
              <CheckCircle2 className="item-icon" aria-hidden /> Approve
            </button>
          </div>
        ) : null}
        {row.status === 'approved' && row.endsAt ? <span className="status-badge active">Runs until {dateOnly(row.endsAt)}</span> : null}
        {row.status === 'rejected' ? <span className="subs-reason">Reason: {row.rejectReason}</span> : null}
        {row.status === 'failed' ? <span className="subs-reason">eSewa: {row.gatewayStatus || 'not paid'} · no money taken</span> : null}
      </div>
    </div>
  );
}

function LimitField({ label, icon: Icon, value, onChange }) {
  const mode = value == null ? 'off' : value === 0 ? 'unlimited' : 'custom';
  return (
    <div className="post-limit-row">
      <div className="post-limit-head">
        <span className="post-limit-icon"><Icon className="item-icon" aria-hidden /></span>
        <div className="post-limit-copy">
          <label>{label}</label>
          <span>{mode === 'off' ? 'Not part of this plan' : mode === 'unlimited' ? 'No daily limit' : `${value} posts every 24 h`}</span>
        </div>
        <div className="post-limit-mode">
          <button type="button" className={mode === 'off' ? 'active' : ''} onClick={() => onChange(null)}>Off</button>
          <button type="button" className={mode === 'custom' ? 'active' : ''} onClick={() => onChange(mode === 'custom' ? value : 20)}>Daily</button>
          <button type="button" className={mode === 'unlimited' ? 'active' : ''} onClick={() => onChange(0)}>Unlimited</button>
        </div>
      </div>
      {mode === 'custom' ? (
        <div className="post-limit-foot">
          <PostLimitStepper value={value} onChange={(next) => onChange(next || 1)} />
          <PostLimitPresets value={value} onPick={(next) => onChange(next || 0)} />
        </div>
      ) : null}
    </div>
  );
}

/** Same words the app writes when a plan has no description of its own. */
function autoSummary(plan) {
  const days = `${Number(plan.durationDays) || 0} day${Number(plan.durationDays) === 1 ? '' : 's'}`;
  const count = (value, what) => (value === 0 ? `unlimited ${what}` : `up to ${value} ${what}`);
  if (plan.shopDailyListings != null) {
    const own = plan.individualDailyListings != null ? ` and ${count(plan.individualDailyListings, 'own items')}` : '';
    return `Post ${count(plan.shopDailyListings, 'shop items')}${own} every day, for ${days}.`;
  }
  if (plan.individualDailyListings == null) return '';
  return `Post ${count(plan.individualDailyListings, 'items')} every day, for ${days}.`;
}

function PlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    plan ? { ...EMPTY_PLAN, ...plan, features: (plan.features || []).join('\n') } : EMPTY_PLAN
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async () => {
    if (form.individualDailyListings == null && form.shopDailyListings == null) {
      setError('Turn on individual posts, store posts, or both');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = { ...form, price: Number(form.price), durationDays: Number(form.durationDays), sortOrder: Number(form.sortOrder) || 0 };
      if (plan?.id) await api.put(`/subscriptions/admin/plans/${plan.id}`, body);
      else await api.post('/subscriptions/admin/plans', body);
      onSaved(plan?.id ? 'Plan updated' : 'Plan created');
    } catch (err) {
      setError(errorText(err, 'Could not save the plan'));
      setBusy(false);
    }
  };

  return (
    <Modal
      icon={Crown}
      title={plan?.id ? `Edit ${plan.name}` : 'New plan'}
      subtitle="Sellers see this on the Plans screen in the app"
      size="lg"
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save plan'}</button>
        </>
      )}
    >
      <div className="subs-form-grid">
        <div className="form-group">
          <label htmlFor="plan-name">Plan name</label>
          <input id="plan-name" className="form-input" maxLength={40} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Pro Seller" required />
        </div>
        <div className="form-group">
          <label htmlFor="plan-price">Price (Rs)</label>
          <input id="plan-price" className="form-input" type="number" min="0" value={form.price} onChange={(e) => set({ price: e.target.value })} required />
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="plan-tagline">Short line</label>
        <input id="plan-tagline" className="form-input" maxLength={90} value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="For sellers who post every day" />
      </div>
      <div className="form-group">
        <label htmlFor="plan-description">One line on the card</label>
        <input
          id="plan-description"
          className="form-input"
          maxLength={140}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={autoSummary(form) || 'Post up to 20 items every day, for 30 days.'}
        />
        <p className="form-hint">Leave empty and the app writes it from the limits: “{autoSummary(form)}”</p>
      </div>
      <div className="form-group">
        <label>Card icon</label>
        <div className="subs-icon-pick">
          {PLAN_ICONS.map(({ value, label, Icon }) => (
            <button key={label} type="button" className={form.icon === value ? 'active' : ''} onClick={() => set({ icon: value })}>
              <Icon aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="plan-days">Length</label>
        <div className="subs-inline">
          <input id="plan-days" className="form-input subs-days" type="number" min="1" max="366" value={form.durationDays} onChange={(e) => set({ durationDays: e.target.value })} />
          <span className="subs-muted">days</span>
          <div className="post-limit-presets">
            {DURATION_PRESETS.map((days) => (
              <button key={days} type="button" className={Number(form.durationDays) === days ? 'active' : ''} onClick={() => set({ durationDays: days })}>
                {days === 365 ? '1 year' : `${days} days`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="post-limits compact">
        <LimitField label="Individual posts" icon={User} value={form.individualDailyListings} onChange={(v) => set({ individualDailyListings: v })} />
        <LimitField label="Store posts" icon={Store} value={form.shopDailyListings} onChange={(v) => set({ shopDailyListings: v })} />
      </div>

      <div className="form-group">
        <label htmlFor="plan-features">What sellers get (one per line, up to 8)</label>
        <textarea
          id="plan-features"
          className="form-textarea"
          rows={4}
          value={form.features}
          onChange={(e) => set({ features: e.target.value })}
          placeholder={'Plan badge on your profile\nHelp on WhatsApp'}
        />
        <p className="form-hint">Each line shows with a green tick under the one line on the card.</p>
      </div>

      <div className="subs-form-grid">
        <ModalSwitch checked={form.highlight} onChange={(v) => set({ highlight: v })} label="Most popular" hint="Shown with a badge and bright button" />
        <ModalSwitch checked={form.active} onChange={(v) => set({ active: v })} label="Visible in the app" hint="Off hides it from new buyers" />
      </div>
      {form.highlight ? (
        <div className="form-group">
          <label htmlFor="plan-badge">Badge text</label>
          <input id="plan-badge" className="form-input" maxLength={24} value={form.badge} onChange={(e) => set({ badge: e.target.value })} placeholder="Most popular" />
          <p className="form-hint">Orange ribbon on the card. Empty shows “Most popular”.</p>
        </div>
      ) : null}
      <div className="form-group">
        <label htmlFor="plan-order">Order</label>
        <input id="plan-order" className="form-input subs-days" type="number" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
        <p className="form-hint">Lower numbers show first. Plans with the same number are sorted by price.</p>
      </div>
      {error ? <div className="u360-error">{error}</div> : null}
    </Modal>
  );
}

function PlanCard({ plan, onEdit, onToggle, onDelete }) {
  const limits = [limitLabel(plan.individualDailyListings, 'individual'), limitLabel(plan.shopDailyListings, 'store')].filter(Boolean);
  return (
    <div className={`subs-plan ${plan.highlight ? 'highlight' : ''} ${plan.active ? '' : 'hidden-plan'}`}>
      {plan.highlight ? <span className="subs-plan-ribbon">{plan.badge || 'Most popular'}</span> : null}
      <div className="subs-plan-top">
        <div>
          <h4>{plan.name}</h4>
          {plan.tagline ? <p className="subs-muted">{plan.tagline}</p> : null}
        </div>
        <div className="subs-plan-price">
          <strong>{npr(plan.price)}</strong>
          <span>{plan.durationDays} days</span>
        </div>
      </div>
      <div className="subs-plan-limits">
        {limits.map((text) => <span key={text}><Rocket aria-hidden /> {text}</span>)}
      </div>
      <ul className="subs-plan-features">
        <li><Check aria-hidden /> {plan.description || autoSummary(plan)}</li>
        {plan.features.map((feature) => <li key={feature}><Check aria-hidden /> {feature}</li>)}
      </ul>
      <div className="subs-plan-foot">
        <span className="subs-muted"><Users aria-hidden /> {plan.subscribers} active</span>
        {!plan.active ? <span className="status-badge suspended">Hidden</span> : null}
        <div className="action-buttons">
          <button type="button" className="action-btn" title={plan.active ? 'Hide' : 'Show'} onClick={() => onToggle(plan)}>
            {plan.active ? <EyeOff className="item-icon" aria-hidden /> : <Eye className="item-icon" aria-hidden />}
          </button>
          <button type="button" className="action-btn view" onClick={() => onEdit(plan)}>
            <Pencil className="item-icon" aria-hidden /> Edit
          </button>
          <button type="button" className="action-btn suspend" title="Delete" onClick={() => onDelete(plan)}>
            <Trash2 className="item-icon" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ payment, onSaved }) {
  const [form, setForm] = useState(payment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setForm(payment), [payment]);
  const changed = PAYMENT_FIELDS.some(({ key }) => form[key] !== payment[key]) || form.note !== payment.note;

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put('/subscriptions/admin/payment', form);
      onSaved(data.payment);
    } catch (err) {
      setError(errorText(err, 'Could not save payment details'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card subs-payment" onSubmit={save}>
      <div className="card-header">
        <h3>Where sellers pay</h3>
      </div>
      <p className="page-hint">
        Sellers see these accounts when they pick a plan, with a copy button. Leave a method empty to hide it.
      </p>
      <div className="subs-form-grid">
        {PAYMENT_FIELDS.map((field) => (
          <div className={`form-group ${field.wide ? 'subs-wide' : ''}`} key={field.key}>
            <label htmlFor={`pay-${field.key}`}>
              <span className="subs-method-dot" style={{ background: METHOD_TONES[field.key] }} /> {field.label}
            </label>
            <input
              id={`pay-${field.key}`}
              className="form-input"
              maxLength={120}
              value={form[field.key] || ''}
              placeholder={field.placeholder}
              onChange={(e) => setForm((current) => ({ ...current, [field.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="form-group">
        <label htmlFor="pay-note">Note for sellers</label>
        <textarea
          id="pay-note"
          className="form-textarea"
          rows={2}
          maxLength={400}
          value={form.note || ''}
          placeholder="Write your phone number in the payment remarks."
          onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))}
        />
      </div>
      {error ? <div className="u360-error">{error}</div> : null}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" disabled={!changed || busy} onClick={() => setForm(payment)}>Reset</button>
        <button type="submit" className="btn btn-primary" disabled={!changed || busy}>{busy ? 'Saving…' : 'Save details'}</button>
      </div>
    </form>
  );
}

function ScreenForm({ screen, onSaved }) {
  const [form, setForm] = useState(screen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setForm(screen), [screen]);
  const changed = JSON.stringify(form) !== JSON.stringify(screen);
  const setStep = (index, patch) =>
    setForm((current) => ({ ...current, steps: current.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.put('/subscriptions/admin/screen', form);
      onSaved(data.screen);
    } catch (err) {
      setError(errorText(err, 'Could not save the screen texts'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card subs-payment" onSubmit={save}>
      <div className="card-header">
        <h3><Smartphone className="item-icon" aria-hidden /> Plans screen in the app</h3>
      </div>
      <p className="page-hint">
        Words sellers read on the Plans &amp; limits screen. Keep them short and simple. An empty box goes back to the default text.
      </p>
      <div className="subs-form-grid">
        {SCREEN_FIELDS.map((field) => (
          <div className={`form-group ${field.wide ? 'subs-wide' : ''}`} key={field.key}>
            <label htmlFor={`screen-${field.key}`}>{field.label}</label>
            <input
              id={`screen-${field.key}`}
              className="form-input"
              maxLength={field.max}
              value={form[field.key] || ''}
              onChange={(e) => setForm((current) => ({ ...current, [field.key]: e.target.value }))}
            />
            <p className="form-hint">{field.hint}</p>
          </div>
        ))}
      </div>
      <h4 className="subs-steps-title">Steps (3)</h4>
      {(form.steps || []).map((step, index) => (
        <div className="subs-step-row" key={index}>
          <span className="subs-step-num">{index + 1}</span>
          <input className="form-input" maxLength={40} value={step.title} placeholder="Step title" onChange={(e) => setStep(index, { title: e.target.value })} />
          <input className="form-input" maxLength={80} value={step.sub} placeholder="Short help line" onChange={(e) => setStep(index, { sub: e.target.value })} />
        </div>
      ))}
      {error ? <div className="u360-error">{error}</div> : null}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" disabled={!changed || busy} onClick={() => setForm(screen)}>Reset</button>
        <button type="submit" className="btn btn-primary" disabled={!changed || busy}>{busy ? 'Saving…' : 'Save texts'}</button>
      </div>
    </form>
  );
}

export default function Subscriptions() {
  const [params] = useSearchParams();
  const initialQ = params.get('q') || '';
  const [tab, setTab] = useState('requests');
  const [status, setStatus] = useState(initialQ ? 'approved' : 'pending');
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [plansData, setPlansData] = useState({ plans: [], payment: {}, screen: null });
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [prompt, setPrompt] = useState(null);

  const fetchPage = useCallback(async (page) => {
    try {
      const { data } = await api.get('/subscriptions/admin/requests', { params: { status, page, q: q || undefined } });
      if (!Array.isArray(data?.requests)) throw new Error('Unexpected response');
      setSummary({ counts: data.counts || {}, revenue: data.revenue || null });
      return { items: data.requests, total: data.total || 0, totalPages: data.totalPages || 1 };
    } catch (err) {
      setMessage(errorText(err, 'Could not load requests'));
      setSummary((current) => current || { counts: {}, revenue: null });
      throw err;
    }
  }, [status, q]);

  const {
    items: requestRows, total: requestTotal, loadingMore, hasMore, loadMore, reload: loadRequests,
  } = useInfiniteList(fetchPage);

  const loadPlans = useCallback(async () => {
    try {
      const { data } = await api.get('/subscriptions/admin/plans');
      if (!Array.isArray(data?.plans)) throw new Error('Unexpected response');
      setPlansData({ plans: data.plans, payment: data.payment || {}, esewa: data.esewa || {}, screen: data.screen || null });
    } catch (err) {
      setMessage(errorText(err, 'Could not load plans'));
    }
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const savePlan = (plan, patch) =>
    api.put(`/subscriptions/admin/plans/${plan.id}`, { ...plan, ...patch })
      .then(loadPlans)
      .catch(() => {});

  const approve = (row) =>
    setPrompt({
      title: `Approve ${row.planName}?`,
      subtitle: `${row.user?.name || row.user?.phone || 'Seller'} · ${npr(row.price)} by ${row.methodLabel}`,
      icon: CheckCircle2,
      confirmLabel: 'Payment received, approve',
      body: (
        <p className="page-hint">
          Check your {row.methodLabel} statement for <strong>{row.reference}</strong> and {npr(row.price)} first.
          The plan starts now for {row.durationDays} days{row.user?.currentPlan?.planId === row.planId ? ', added on top of the current plan' : ''}.
        </p>
      ),
      onConfirm: async () => {
        await api.post(`/subscriptions/admin/requests/${row.id}/approve`);
        setPrompt(null);
        toast.success(`${row.planName} is now active for ${row.user?.name || 'the seller'}.`, { title: 'Plan approved' });
        loadRequests();
        loadPlans();
      },
    });

  const reject = (row) =>
    setPrompt({
      title: 'Reject this request?',
      subtitle: `${row.planName} · ${row.reference}`,
      icon: XCircle,
      danger: true,
      confirmLabel: 'Reject',
      field: { label: 'Reason (the seller sees this)', required: true, presets: REJECT_PRESETS, multiline: true },
      onConfirm: async (reason) => {
        await api.post(`/subscriptions/admin/requests/${row.id}/reject`, { reason });
        setPrompt(null);
        toast.success('The seller sees your reason.', { title: 'Request rejected' });
        loadRequests();
      },
    });

  const removePlan = (plan) =>
    setPrompt({
      title: `Delete ${plan.name}?`,
      subtitle: 'If sellers already bought it, it is hidden instead so their history stays.',
      icon: Trash2,
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const { data } = await api.delete(`/subscriptions/admin/plans/${plan.id}`);
        setPrompt(null);
        toast.success(data?.message || `${plan.name} deleted`);
        loadPlans();
      },
    });

  const counts = summary?.counts || {};
  const revenue = summary?.revenue || { amount: 0, amount30d: 0, online: 0, test: 0 };
  const activeSubscribers = plansData.plans.reduce((sum, plan) => sum + (plan.subscribers || 0), 0);
  const livePlans = plansData.plans.filter((plan) => plan.active).length;
  const esewaState = plansData.esewa || {};
  const paymentReady = Boolean(esewaState.enabled && esewaState.openToAll);

  if (!summary) return <div className="loading">Loading subscriptions...</div>;

  return (
    <div className="users-page subs-page">
      {!livePlans || !paymentReady ? (
        <div className="ai-alert">
          {!livePlans ? 'No plan is visible in the app yet. Create a plan so sellers can upgrade. ' : ''}
          {!paymentReady
            ? esewaState.enabled
              ? 'eSewa is in test mode for staff and testers only. Sellers cannot buy plans until you go live or open test mode to everyone (Payment details).'
              : 'Sellers pay for plans only with eSewa. Turn on eSewa in Payment details.'
            : ''}
        </div>
      ) : null}

      <div className="stats-grid">
        <button type="button" className="stat-card subs-stat" onClick={() => { setTab('requests'); setStatus('pending'); }}>
          <div className="stat-icon subs-stat-icon warn"><Clock className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Waiting for review</h3>
            <p className="stat-value">{counts.pending || 0}</p>
            <div className="stat-trend">Check the payment, then approve</div>
          </div>
        </button>
        <div className="stat-card">
          <div className="stat-icon subs-stat-icon"><Crown className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Active subscribers</h3>
            <p className="stat-value">{activeSubscribers}</p>
            <div className="stat-trend">{counts.approved || 0} approved requests in total</div>
          </div>
        </div>
        <button type="button" className="stat-card subs-stat" onClick={() => { setTab('requests'); setStatus('approved'); }}>
          <div className="stat-icon subs-stat-icon money"><Banknote className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Collected</h3>
            <p className="stat-value">{npr(revenue.amount)}</p>
            <div className="stat-trend">
              {npr(revenue.amount30d)} in 30 days · {npr(revenue.online)} by eSewa
              {revenue.test ? ` · ${npr(revenue.test)} test` : ''}
            </div>
          </div>
        </button>
        <button type="button" className="stat-card subs-stat" onClick={() => setTab('plans')}>
          <div className="stat-icon subs-stat-icon"><Rocket className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Plans in the app</h3>
            <p className="stat-value">{livePlans}</p>
            <div className="stat-trend">{plansData.plans.length - livePlans} hidden</div>
          </div>
        </button>
      </div>

      {message ? <div className="ai-alert">{message}</div> : null}

      <div className="subs-tabs">
        <div className="post-limit-mode">
          <button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
            Requests{counts.pending ? ` (${counts.pending})` : ''}
          </button>
          <button type="button" className={tab === 'plans' ? 'active' : ''} onClick={() => setTab('plans')}>Plans</button>
          <button type="button" className={tab === 'screen' ? 'active' : ''} onClick={() => setTab('screen')}>App screen</button>
          <button type="button" className={tab === 'payment' ? 'active' : ''} onClick={() => setTab('payment')}>Payment details</button>
        </div>
        {tab === 'plans' ? (
          <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus className="item-icon" aria-hidden /> New plan
          </button>
        ) : null}
      </div>

      {tab === 'requests' ? (
        <div className="card subs-requests-card">
          <div className="subs-request-bar">
            <div className="u360-chips subs-status">
              {STATUSES.map((item) => (
                <button key={item.value} type="button" className={`u360-chip ${status === item.value ? 'on' : ''}`} onClick={() => setStatus(item.value)}>
                  {item.label} · {counts[item.value] || 0}
                </button>
              ))}
            </div>
            <label className="subs-search">
              <Search aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, phone, transaction ID or bill no"
              />
            </label>
          </div>
          {requestRows.length ? (
            <div className="subs-request-list">
              {requestRows.map((row) => (
                <RequestCard key={row.id} row={row} onApprove={approve} onReject={reject} />
              ))}
            </div>
          ) : (
            <div className="subs-empty">
              <Wallet aria-hidden />
              <p>
                {q ? `Nothing matches “${q}”.` : status === 'pending' ? 'No payments waiting. New requests show up here.' : 'Nothing here yet.'}
              </p>
            </div>
          )}
          <InfiniteLoader
            shown={requestRows.length}
            total={requestTotal}
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
            label="requests"
          />
        </div>
      ) : null}

      {tab === 'plans' ? (
        plansData.plans.length ? (
          <div className="subs-plan-grid">
            {plansData.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={setEditing}
                onToggle={(p) => savePlan(p, { active: !p.active })}
                onDelete={removePlan}
              />
            ))}
          </div>
        ) : (
          <div className="card subs-empty">
            <CreditCard aria-hidden />
            <p>No plans yet. A plan sets the price, length and daily posts sellers get.</p>
            <button type="button" className="btn btn-primary" onClick={() => setEditing({})}>
              <Plus className="item-icon" aria-hidden /> Create the first plan
            </button>
          </div>
        )
      ) : null}

      {tab === 'screen' && plansData.screen ? (
        <ScreenForm
          screen={plansData.screen}
          onSaved={(screen) => {
            setPlansData((current) => ({ ...current, screen }));
            toast.success('The app shows the new texts next time sellers open Plans.', { title: 'Texts saved' });
          }}
        />
      ) : null}

      {tab === 'payment' ? <EsewaGatewayCard /> : null}
      {tab === 'payment' ? (
        <PaymentForm
          payment={plansData.payment || {}}
          onSaved={(payment) => {
            setPlansData((current) => ({ ...current, payment }));
            toast.success('Payment details saved');
          }}
        />
      ) : null}

      <p className="page-hint">
        A plan raises the seller&apos;s daily post limit until it ends. A custom limit set on a user&apos;s page
        still wins over any plan. Sellers buy plans with eSewa in the app, and the plan turns on by itself after
        payment. Older manual requests still wait here for you to check and approve.
      </p>

      {editing ? (
        <PlanModal
          plan={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            toast.success(text);
            loadPlans();
          }}
        />
      ) : null}

      {prompt ? (
        <PromptModal {...prompt} onClose={() => setPrompt(null)}>
          {prompt.body}
        </PromptModal>
      ) : null}
    </div>
  );
}
