import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const POLL_MS = 30000;

function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '0%';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}%`;
}

function MiniBars({ series, color }) {
  const max = Math.max(1, ...(series || []).map((d) => d.count || 0));
  return (
    <div className="bi-mini-bars">
      {(series || []).map((d) => (
        <div key={d.date} className="bi-mini-bar-wrap" title={`${d.date}: ${d.count}`}>
          <div
            className="bi-mini-bar"
            style={{
              height: `${Math.max(6, (d.count / max) * 100)}%`,
              background: color,
            }}
          />
          <span className="bi-mini-label">{String(d.date).slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeListings: 0,
    pendingReports: 0,
    pendingShops: 0,
    dau: 0,
    signupsToday: 0,
    transactionsToday: 0,
    newListingsToday: 0,
    signupsChangePct: 0,
    transactionsChangePct: 0,
  });
  const [live, setLive] = useState(null);
  const [topCategories, setTopCategories] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [attentionItems, setAttentionItems] = useState([]);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async ({ silent } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const response = await api.get('/auth/admin/dashboard-stats');
      setStats(response.data.stats || {});
      setLive(response.data.live || null);
      setTopCategories(response.data.topCategories || []);
      setAnomalies(response.data.anomalies || []);
      setWeeklyData(response.data.weeklyData || []);
      setRecentActivity(response.data.recentActivity || []);
      setAttentionItems(response.data.attentionItems || []);
      setRefreshedAt(response.data.refreshedAt || new Date().toISOString());
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData({ silent: true });
      }
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchDashboardData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchDashboardData]);

  const acknowledgeAlert = async (id) => {
    try {
      await api.patch(`/auth/admin/platform-alerts/${id}`, { status: 'acknowledged' });
      fetchDashboardData({ silent: true });
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  const maxListings = Math.max(1, ...weeklyData.map((d) => d.listings || 0), 0);
  const maxCat = Math.max(1, ...topCategories.map((c) => c.count || 0), 0);

  const liveCards = [
    {
      title: 'DAU (today)',
      value: stats.dau || 0,
      icon: '📡',
      hint: 'Users active today',
      color: '#2563eb',
    },
    {
      title: 'Sign-ups today',
      value: stats.signupsToday || 0,
      icon: '✍️',
      hint: formatPct(stats.signupsChangePct) + ' vs yesterday',
      trendUp: (stats.signupsChangePct || 0) >= 0,
      color: '#059669',
    },
    {
      title: 'Transactions today',
      value: stats.transactionsToday || 0,
      icon: '🤝',
      hint: formatPct(stats.transactionsChangePct) + ' vs yesterday · sold listings',
      trendUp: (stats.transactionsChangePct || 0) >= 0,
      color: '#d97706',
    },
    {
      title: 'New listings today',
      value: stats.newListingsToday || 0,
      icon: '📦',
      hint: 'Posted today',
      color: '#7c3aed',
    },
  ];

  const baseCards = [
    { title: 'Total Users', value: stats.totalUsers || 0, icon: '👥', color: '#0f766e' },
    { title: 'Active Listings', value: stats.activeListings || 0, icon: '🗂️', color: '#0284c7' },
    { title: 'Pending Reports', value: stats.pendingReports || 0, icon: '🚩', color: '#dc2626' },
    { title: 'Shops awaiting verify', value: stats.pendingShops || 0, icon: '🏪', color: '#ca8a04' },
  ];

  return (
    <div className="dashboard">
      <div className="bi-live-bar">
        <div>
          <h2 className="bi-title">Business intelligence</h2>
          <p className="bi-subtitle">
            Live metrics auto-refresh every {POLL_MS / 1000}s
            {refreshedAt ? ` · updated ${new Date(refreshedAt).toLocaleTimeString()}` : ''}
            {refreshing ? ' · refreshing…' : ''}
          </p>
        </div>
        <button type="button" className="view-report-btn" onClick={() => fetchDashboardData()}>
          Refresh now
        </button>
      </div>

      {anomalies.length > 0 ? (
        <div className="bi-anomaly-banner">
          <strong>Anomaly alerts</strong>
          <ul>
            {anomalies.map((a) => (
              <li key={a.id}>
                <span>
                  {a.title} — {a.message}
                </span>
                {a.status === 'open' ? (
                  <button type="button" className="action-btn" onClick={() => acknowledgeAlert(a.id)}>
                    Acknowledge
                  </button>
                ) : (
                  <em>{a.status}</em>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="stats-grid">
        {liveCards.map((stat) => (
          <div key={stat.title} className="stat-card" style={{ '--stat-accent': stat.color }}>
            <div className="stat-icon" style={{ backgroundColor: `${stat.color}18`, color: stat.color }}>
              {stat.icon}
            </div>
            <div className="stat-content">
              <h3>{stat.title}</h3>
              <p className="stat-value">{Number(stat.value).toLocaleString()}</p>
              <div className={`stat-trend ${stat.trendUp === false ? 'trend-down' : 'trend-up'}`}>
                {stat.hint}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="stats-grid" style={{ marginTop: 12 }}>
        {baseCards.map((stat) => (
          <div key={stat.title} className="stat-card" style={{ '--stat-accent': stat.color }}>
            <div className="stat-icon" style={{ backgroundColor: `${stat.color}18`, color: stat.color }}>
              {stat.icon}
            </div>
            <div className="stat-content">
              <h3>{stat.title}</h3>
              <p className="stat-value">{Number(stat.value).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid bi-grid-3">
        <div className="chart-card">
          <div className="card-header">
            <h3>Sign-ups (7 days)</h3>
            <span className="bi-baseline">
              baseline ~{live?.baselines?.signups ?? 0}/day
            </span>
          </div>
          <MiniBars series={live?.signupsSeries} color="#059669" />
        </div>

        <div className="chart-card">
          <div className="card-header">
            <h3>Transactions / sold (7 days)</h3>
            <span className="bi-baseline">
              baseline ~{live?.baselines?.transactions ?? 0}/day
            </span>
          </div>
          <MiniBars series={live?.transactionsSeries} color="#d97706" />
        </div>

        <div className="chart-card">
          <div className="card-header">
            <h3>Top categories (7 days)</h3>
            <Link to="/admin/listings" className="view-report-btn">
              Listings
            </Link>
          </div>
          <div className="bi-cat-list">
            {topCategories.length === 0 ? (
              <div className="empty-state compact">No category data yet</div>
            ) : (
              topCategories.map((c) => (
                <div key={c.category} className="bi-cat-row">
                  <span className="bi-cat-name">{c.category}</span>
                  <div className="bi-cat-track">
                    <div
                      className="bi-cat-fill"
                      style={{ width: `${(c.count / maxCat) * 100}%` }}
                    />
                  </div>
                  <span className="bi-cat-count">{c.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="chart-card">
          <div className="card-header">
            <h3>Weekly Listings</h3>
            <Link to="/admin/listings" className="view-report-btn">
              View listings
            </Link>
          </div>
          <div className="chart-container">
            <div className="bar-chart">
              {weeklyData.map((data) => (
                <div key={data.day} className="bar-wrapper">
                  <div
                    className="bar"
                    style={{
                      height: `${(data.listings / maxListings) * 100}%`,
                    }}
                  />
                  <div className="bar-label">{data.day}</div>
                  <div className="bar-value">{data.listings}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="activity-card">
          <div className="card-header">
            <h3>Recent Activity</h3>
          </div>
          <div className="activity-list">
            {recentActivity.length === 0 ? (
              <div className="empty-state compact">No recent activity yet</div>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="activity-item">
                  <div className={`activity-icon ${activity.type}`}>
                    {activity.type === 'report' && '🚩'}
                    {activity.type === 'verification' && '📄'}
                    {activity.type === 'action' && '⚡'}
                    {activity.type === 'system' && '⚙️'}
                  </div>
                  <div className="activity-content">
                    <p className="activity-message">{activity.message}</p>
                    <span className="activity-time">{activity.time}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="attention-card">
        <div className="card-header">
          <h3>Needs Your Attention</h3>
        </div>
        <div className="attention-table">
          {attentionItems.length === 0 ? (
            <div className="empty-state compact">Nothing needs attention right now</div>
          ) : (
            attentionItems.map((item) => (
              <div key={item.id} className="attention-item">
                <div className={`priority-badge ${item.priority.toLowerCase()}`}>
                  {item.priority}
                </div>
                <div className="attention-content">
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                  <span className="attention-time">{item.time}</span>
                </div>
                <Link to={item.link || '/admin/reports'} className="review-btn">
                  Review
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
