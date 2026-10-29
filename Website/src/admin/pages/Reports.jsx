import { useState, useCallback } from 'react';
import { ChevronDown, Clock, FileText, Filter, Flag, MessageSquare, Package, Search, User, X } from 'lucide-react';
import api from '../services/api';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import InfiniteLoader from '../components/InfiniteLoader';
import useInfiniteList from '../utils/useInfiniteList';
import useDebounce from '../utils/useDebounce';
import { useTheme } from '../context/ThemeContext';
import RecordModal from '../components/RecordModal';

const REASON_LABELS = {
  spam: 'Spam',
  'fake-listing': 'Fake listing',
  inappropriate: 'Inappropriate',
  'not-available': 'Not available',
  scam: 'Scam or fraud',
  'no-show': 'No-show',
  other: 'Other',
};

const Reports = () => {
  const { colors } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [view, setView] = useViewMode('reports', 'list');
  const debouncedSearch = useDebounce(searchTerm);

  const limit = 20;

  const fetchPage = useCallback(async (page) => {
    try {
      const response = await api.get('/reports/admin/all', {
        params: {
          status: filter === 'all' ? undefined : filter,
          q: debouncedSearch,
          page,
          limit
        }
      });
      
      const { reports: data, total: totalCount, totalPages: pages } = response.data;
      
      const reportsData = data.map(report => ({
        id: report._id,
        type: report.reportedListing ? 'listing' : 'user',
        reportedItem: report.reportedListing?.title || `User ${report.reportedUser?.name || 'Unknown'}`,
        itemId: report.reportedListing?._id || report.reportedUser?._id,
        reason: REASON_LABELS[report.reason] || report.reason,
        reporter: report.reporter,
        createdAt: report.createdAt,
        details: report.details || '',
        priority: report.reason === 'scam' ? 'High' : (report.reason === 'not-available' ? 'Low' : 'Medium'),
        status: report.status === 'pending'
          ? 'open'
          : (report.status === 'reviewed'
            ? 'under_review'
            : (report.status === 'dismissed' ? 'dismissed' : 'resolved')),
      }));
      
      return { items: reportsData, total: totalCount || 0, totalPages: pages || 1 };
    } catch (error) {
      console.error('Failed to fetch reports:', error);
      throw error;
    }
  }, [filter, debouncedSearch, limit]);

  const {
    items: reports, total, loading, loadingMore, hasMore, loadMore, reload: fetchReports,
  } = useInfiniteList(fetchPage);

  const filterOptions = [
    { value: 'all', label: 'All Reports' },
    { value: 'pending', label: 'Open' },
    { value: 'reviewed', label: 'Under Review' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'dismissed', label: 'Dismissed' },
  ];

  const handleReportAction = async (reportId, action) => {
    try {
      let status;
      
      if (action === 'dismiss') {
        status = 'dismissed';
      } else if (action === 'take-action') {
        status = 'reviewed';
      } else if (action === 'resolve') {
        status = 'resolved';
      }

      await api.patch(`/reports/admin/${reportId}/status`, { status });
      fetchReports(); // Refresh the list
    } catch (error) {
      console.error('Failed to update report status:', error);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return <span className="status-badge open">Open</span>;
      case 'under_review':
        return <span className="status-badge under-review">Under Review</span>;
      case 'resolved':
        return <span className="status-badge resolved">Resolved</span>;
      case 'dismissed':
        return <span className="status-badge dismissed">Dismissed</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const getPriorityBadge = (priority) => {
    const priorityClass = priority.toLowerCase();
    return (
      <span className={`priority-badge ${priorityClass}`}>
        {priority}
      </span>
    );
  };

  const getTypeIcon = (type) => {
    const Icon = {
      listing: Package,
      user: User,
      message: MessageSquare,
    }[type] || FileText;
    return <Icon className="item-icon" aria-hidden />;
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  const renderActions = (report) => (
    <div className="action-buttons">
      <button type="button" className="action-btn view" onClick={() => setSelected(report)}>View</button>
      {report.status !== 'resolved' && report.status !== 'dismissed' && (
        <>
          <button className="action-btn dismiss" onClick={() => handleReportAction(report.id, 'dismiss')}>Dismiss</button>
          {report.status === 'open' ? (
            <button className="action-btn take-action" onClick={() => handleReportAction(report.id, 'take-action')}>Take Action</button>
          ) : null}
          {report.status === 'under_review' ? (
            <button className="action-btn approve" onClick={() => handleReportAction(report.id, 'resolve')}>Resolve</button>
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <div className="reports-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        <div className="filter-group right">
          <ViewToggle view={view} onChange={setView} />
          <div className="dropdown-filter">
            <Filter className="filter-icon" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {filterOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="chev-icon" />
          </div>
          {(searchTerm || filter !== 'all') && (
            <button className="clear-btn" onClick={() => { setSearchTerm(''); setFilter('pending'); }}>
              <X className="item-icon" /> Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="table-container">
          <div className="empty-state">No reports found</div>
        </div>
      ) : (
        <>
          {view === 'card' ? (
            <div className="card-grid cols-5">
              {reports.map((report) => (
                <article className="data-card" key={report.id}>
                  <div className="data-card-body">
                    <div className="data-card-head">
                      <span className="user-avatar-small">{getTypeIcon(report.type)}</span>
                      <div className="data-card-head-text">
                        <div className="data-card-title">{report.reportedItem}</div>
                        <div className="data-card-sub">#{report.itemId}</div>
                      </div>
                    </div>
                    <div className="data-card-pricerow">
                      <span className="data-card-sub">
                        {report.type.charAt(0).toUpperCase() + report.type.slice(1)} ·{' '}
                        {report.reporter?.name || 'N/A'}
                      </span>
                      {getStatusBadge(report.status)}
                    </div>
                    <div className="data-card-desc">{report.reason}</div>
                    <div className="data-card-meta">
                      <span>
                        <Clock className="item-icon" aria-hidden /> {formatTime(report.createdAt)}
                      </span>
                      {getPriorityBadge(report.priority)}
                    </div>
                    <div className="data-card-actions">{renderActions(report)}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reported Item</th>
                    <th>Type</th>
                    <th>Reason</th>
                    <th>Reporter</th>
                    <th>Time</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id}>
                      <td>
                        <div className="reported-item-cell">
                          <span className="type-icon">{getTypeIcon(report.type)}</span>
                          <div>
                            <div className="reported-item">{report.reportedItem}</div>
                            <div className="item-id">#{report.itemId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="type-cell">{report.type.charAt(0).toUpperCase() + report.type.slice(1)}</td>
                      <td className="reason-cell">{report.reason}</td>
                      <td>{report.reporter?.name || 'N/A'}</td>
                      <td>{formatTime(report.createdAt)}</td>
                      <td>{getPriorityBadge(report.priority)}</td>
                      <td>{getStatusBadge(report.status)}</td>
                      <td>{renderActions(report)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <InfiniteLoader
            shown={reports.length}
            total={total}
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
            label="reports"
          />
        </>
      )}
      <RecordModal
        title={selected?.reportedItem}
        onClose={() => setSelected(null)}
        rows={selected ? [
          ['Type', selected.type],
          ['Reason', selected.reason],
          ['Details', selected.details],
          ['Reporter', selected.reporter?.name],
          ['Status', selected.status],
          ['When', selected.createdAt ? formatTime(selected.createdAt) : ''],
        ] : null}
      />
    </div>
  );
};

export default Reports;