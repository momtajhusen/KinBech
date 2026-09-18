import { useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const Reports = () => {
  const { colors } = useTheme();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('open');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await api.get('/reports/admin/all');
      const reportsData = response.data.reports.map(report => ({
        id: report._id,
        type: report.reportedListing ? 'listing' : 'user',
        reportedItem: report.reportedListing?.title || `User ${report.reportedUser?.name || 'Unknown'}`,
        itemId: report.reportedListing?._id || report.reportedUser?._id,
        reason: report.reason,
        reporter: report.reporter,
        createdAt: report.createdAt,
        priority: 'Medium', // Default priority since model doesn't have it
        status: report.status === 'pending' ? 'open' : (report.status === 'reviewed' ? 'under_review' : 'resolved'),
      }));
      setReports(reportsData);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All Reports' },
    { value: 'open', label: 'Open' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'resolved', label: 'Resolved' },
  ];

  const filteredReports = reports.filter(report => {
    const matchesSearch =
      report.reportedItem?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reporter?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'open' && report.status === 'open') ||
      (filter === 'under_review' && report.status === 'under_review') ||
      (filter === 'resolved' && report.status === 'resolved');

    return matchesSearch && matchesFilter;
  });

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
    switch (type) {
      case 'listing': return '📦';
      case 'user': return '👤';
      case 'message': return '💬';
      default: return '📄';
    }
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

  return (
    <div className="reports-page">
      <div className="page-header">
        <div className="page-filters">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={`filter-chip ${filter === option.value ? 'active' : ''}`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search reports by item, reason, or reporter..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {loading ? (
        <div className="loading">Loading reports...</div>
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
              {filteredReports.map((report) => (
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
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn view">View</button>
                      {report.status !== 'resolved' && (
                        <>
                          <button className="action-btn dismiss" onClick={() => handleReportAction(report.id, 'dismiss')}>Dismiss</button>
                          <button className="action-btn take-action" onClick={() => handleReportAction(report.id, 'take-action')}>Take Action</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredReports.length === 0 && (
            <div className="empty-state">No reports found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;