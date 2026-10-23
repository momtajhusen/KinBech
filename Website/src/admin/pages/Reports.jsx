import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Clock, FileText, Filter, Flag, MessageSquare, Package, Search, User, X } from 'lucide-react';
import api from '../services/api';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { useTheme } from '../context/ThemeContext';

const Reports = () => {
  const { colors } = useTheme();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('pending');
  const [view, setView] = useViewMode('reports', 'list');
  const debouncedSearch = useDebounce(searchTerm);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchReports = useCallback(async () => {
    setLoading(true);
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
        reason: report.reason,
        reporter: report.reporter,
        createdAt: report.createdAt,
        priority: 'Medium',
        status: report.status === 'pending' ? 'open' : (report.status === 'reviewed' ? 'under_review' : 'resolved'),
      }));
      
      setReports(reportsData);
      setTotal(totalCount || 0);
      setTotalPages(pages || 1);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, page, limit]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const filterOptions = [
    { value: 'all', label: 'All Reports' },
    { value: 'pending', label: 'Open' },
    { value: 'reviewed', label: 'Under Review' },
    { value: 'resolved', label: 'Resolved' },
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
      <button className="action-btn view">View</button>
      {report.status !== 'resolved' && (
        <>
          <button className="action-btn dismiss" onClick={() => handleReportAction(report.id, 'dismiss')}>Dismiss</button>
          <button className="action-btn take-action" onClick={() => handleReportAction(report.id, 'take-action')}>Take Action</button>
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

          <Pagination 
            page={page} 
            totalPages={totalPages} 
            total={total} 
            limit={limit} 
            onPageChange={setPage} 
          />
        </>
      )}
    </div>
  );
};

export default Reports;