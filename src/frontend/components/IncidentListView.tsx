import React, { useState } from 'react';
import { IncidentRecord } from '../types/triage';

interface IncidentListViewProps {
  incidents: IncidentRecord[];
  onSelectIncident: (incidentId: string) => void;
  onRefresh: () => void;
}

export const IncidentListView: React.FC<IncidentListViewProps> = ({
  incidents,
  onSelectIncident,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  const filteredIncidents = incidents.filter((inc) => {
    // Search matching
    const matchesSearch =
      !searchTerm ||
      inc.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.issueType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.description.toLowerCase().includes(searchTerm.toLowerCase());

    // Category matching
    const matchesCategory = selectedCategory === 'ALL' || inc.category === selectedCategory;

    // Priority matching
    const matchesPriority =
      selectedPriority === 'ALL' ||
      inc.priority.toUpperCase().includes(selectedPriority.toUpperCase());

    // Status matching
    const matchesStatus = selectedStatus === 'ALL' || inc.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesPriority && matchesStatus;
  });

  const getPriorityBadgeClass = (priority: string) => {
    const p = priority.toUpperCase();
    if (p.includes('CRITICAL') || p.includes('P1')) return 'priority-p1';
    if (p.includes('HIGH') || p.includes('P2')) return 'priority-p2';
    if (p.includes('MEDIUM') || p.includes('P3')) return 'priority-p3';
    return 'priority-p4';
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'status-open';
      case 'IN_PROGRESS':
        return 'status-progress';
      case 'RESOLVED':
        return 'status-resolved';
      case 'REOPENED':
        return 'status-reopened';
      case 'ESCALATED':
        return 'status-escalated';
      default:
        return 'status-default';
    }
  };

  return (
    <div className="incident-list-view">
      <div className="list-toolbar">
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder="Filter tickets by #, keyword, description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="filter-search-input"
          />
        </div>

        <div className="filter-selects">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-dropdown"
          >
            <option value="ALL">All Categories</option>
            <option value="NETWORK">Network</option>
            <option value="ACCOUNT">Account</option>
            <option value="APPLICATION">Application</option>
            <option value="DEVICE">Device</option>
            <option value="OTHER">Other</option>
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="filter-dropdown"
          >
            <option value="ALL">All Priorities</option>
            <option value="P1">P1 Critical</option>
            <option value="P2">P2 High</option>
            <option value="P3">P3 Medium</option>
            <option value="P4">P4 Low</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="filter-dropdown"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REOPENED">Reopened</option>
            <option value="ESCALATED">Escalated</option>
          </select>

          <button onClick={onRefresh} className="btn-secondary refresh-btn" title="Refresh list">
            <svg viewBox="0 0 20 20" fill="currentColor" className="refresh-icon">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div className="list-stats-bar">
        <span>Showing <strong>{filteredIncidents.length}</strong> of <strong>{incidents.length}</strong> tickets</span>
      </div>

      {filteredIncidents.length === 0 ? (
        <div className="empty-incidents-state">
          <div className="empty-icon font-mono">📁</div>
          <h4>No matching tickets found</h4>
          <p>Try adjusting your search keywords or filter criteria.</p>
        </div>
      ) : (
        <div className="incident-grid">
          {filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              className="incident-card"
              onClick={() => onSelectIncident(inc.id)}
            >
              <div className="card-top-bar">
                <div className="ticket-ident">
                  <span className="ticket-badge">{inc.ticketNumber}</span>
                  <span className="category-pill">{inc.category}</span>
                </div>
                <div className="pills-group">
                  <span className={`priority-badge ${getPriorityBadgeClass(inc.priority)}`}>
                    {inc.priority.replace('_', ' ')}
                  </span>
                  <span className={`status-badge ${getStatusBadgeClass(inc.status)}`}>
                    {inc.status}
                  </span>
                </div>
              </div>

              <h4 className="card-title">{inc.summary}</h4>

              <p className="card-issue-type">
                <span className="label">Issue:</span> {inc.issueType.replace(/_/g, ' ')}
              </p>

              <div className="card-meta-footer">
                <span className="card-date font-mono">
                  {new Date(inc.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                <span className="view-detail-link">Inspect Workbench →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
