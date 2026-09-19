import React, { useState, useEffect } from 'react';
import { DashboardStats, IncidentRecord } from '../types/triage';
import { ApiClient } from '../services/apiClient';
import { EngineerIncidentInspector } from './EngineerIncidentInspector';

export const EngineerDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Queue View Filters
  const [activeQueueFilter, setActiveQueueFilter] = useState<
    'ALL' | 'OPEN' | 'HIGH_CRITICAL' | 'ESCALATED' | 'RESOLVED'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Inspection Drawer State
  const [inspectingIncidentId, setInspectingIncidentId] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ApiClient.fetchDashboardStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading IT Support Engineer Operations Dashboard...</div>;
  }

  if (error || !stats) {
    return (
      <div className="dashboard-error-card">
        <h4>Dashboard Data Unavailable</h4>
        <p>{error || 'Failed to load database stats.'}</p>
        <button onClick={loadDashboardStats} className="btn-primary btn-sm mt-2">
          Retry Loading
        </button>
      </div>
    );
  }

  // Derive incidents array for the active queue filter
  let queueIncidents: IncidentRecord[] = [];
  switch (activeQueueFilter) {
    case 'OPEN':
      queueIncidents = stats.openIncidents;
      break;
    case 'HIGH_CRITICAL':
      queueIncidents = stats.highCriticalIncidents;
      break;
    case 'RESOLVED':
      queueIncidents = stats.recentlyResolvedIncidents;
      break;
    case 'ESCALATED':
      queueIncidents = stats.escalatedIncidents;
      break;
    default:
      // ALL: combine unique incidents
      const map = new Map<string, IncidentRecord>();
      [...stats.openIncidents, ...stats.highCriticalIncidents, ...stats.recentlyResolvedIncidents, ...stats.escalatedIncidents].forEach(inc => map.set(inc.id, inc));
      queueIncidents = Array.from(map.values());
      break;
  }

  // Apply search query filter
  const filteredQueue = queueIncidents.filter((inc) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inc.ticketNumber.toLowerCase().includes(q) ||
      inc.summary.toLowerCase().includes(q) ||
      inc.issueType.toLowerCase().includes(q) ||
      inc.category.toLowerCase().includes(q)
    );
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

  // Filter recurring patterns with count >= 2 for pattern alerts
  const realPatterns = stats.recurringPatterns.filter((p) => p.count >= 2);

  return (
    <div className="engineer-dashboard-container">
      {/* Real-time KPI Stats Banner */}
      <div className="kpi-banner-grid">
        <div
          className={`kpi-card ${activeQueueFilter === 'OPEN' ? 'selected' : ''}`}
          onClick={() => setActiveQueueFilter('OPEN')}
        >
          <div className="kpi-top">
            <span className="kpi-title">Open Incidents</span>
            <span className="kpi-icon">📬</span>
          </div>
          <div className="kpi-val font-mono">{stats.openCount}</div>
          <div className="kpi-sub">Active triage & in-progress</div>
        </div>

        <div
          className={`kpi-card ${activeQueueFilter === 'HIGH_CRITICAL' ? 'selected' : ''}`}
          onClick={() => setActiveQueueFilter('HIGH_CRITICAL')}
        >
          <div className="kpi-top">
            <span className="kpi-title">P1/P2 High & Critical</span>
            <span className="kpi-icon">🚨</span>
          </div>
          <div className="kpi-val font-mono text-red">{stats.highCriticalCount}</div>
          <div className="kpi-sub">Priority attention required</div>
        </div>

        <div
          className={`kpi-card ${activeQueueFilter === 'ESCALATED' ? 'selected' : ''}`}
          onClick={() => setActiveQueueFilter('ESCALATED')}
        >
          <div className="kpi-top">
            <span className="kpi-title">Escalated Tickets</span>
            <span className="kpi-icon">⚠️</span>
          </div>
          <div className="kpi-val font-mono text-orange">{stats.escalatedCount}</div>
          <div className="kpi-sub">Tier 2 / Vendor escalation</div>
        </div>

        <div
          className={`kpi-card ${activeQueueFilter === 'RESOLVED' ? 'selected' : ''}`}
          onClick={() => setActiveQueueFilter('RESOLVED')}
        >
          <div className="kpi-top">
            <span className="kpi-title">Recently Resolved</span>
            <span className="kpi-icon">✅</span>
          </div>
          <div className="kpi-val font-mono text-green">{stats.resolvedCount}</div>
          <div className="kpi-sub">Completed resolutions</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">Avg Resolution Time</span>
            <span className="kpi-icon">⏱️</span>
          </div>
          {stats.avgResolutionTimeMinutes !== null ? (
            <div className="kpi-val font-mono">{stats.avgResolutionTimeMinutes} min</div>
          ) : (
            <div className="kpi-val-empty">--</div>
          )}
          <div className="kpi-sub">
            {stats.avgResolutionTimeMinutes !== null
              ? 'Derived from actual ticket timestamps'
              : 'No resolved ticket data yet'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-title">Incident Relationships</span>
            <span className="kpi-icon">🔗</span>
          </div>
          <div className="kpi-val font-mono">
            {stats.relationshipSummary.confirmedCount} <span className="kpi-small">confirmed</span>
          </div>
          <div className="kpi-sub">
            {stats.relationshipSummary.proposedCount} AI proposed links
          </div>
        </div>
      </div>

      {/* Recurring Pattern Detection Panel */}
      <div className="dashboard-section-card">
        <div className="section-header">
          <div className="header-title">
            <h3>Recurring Issue Patterns</h3>
            <span className="section-subtitle">Auto-detected clusters from stored support history</span>
          </div>
          <button onClick={loadDashboardStats} className="btn-secondary btn-sm">
            Refresh Metrics
          </button>
        </div>

        {realPatterns.length === 0 ? (
          <div className="pattern-empty-state">
            <span className="empty-icon font-mono">🔍</span>
            <p>No recurring issue patterns (count ≥ 2) detected in ticket volume.</p>
          </div>
        ) : (
          <div className="pattern-cards-grid">
            {realPatterns.map((pat, idx) => (
              <div key={idx} className="pattern-card">
                <div className="pattern-top">
                  <span className="pattern-count-badge font-mono">{pat.count} Occurrences</span>
                  <span className="category-pill">{pat.category}</span>
                </div>
                <h4 className="pattern-name">{pat.issueType.replace(/_/g, ' ')}</h4>
                <div className="pattern-footer">
                  <span className="pattern-label font-mono">Clustered Pattern</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* High-Density Support Queue Table */}
      <div className="dashboard-section-card">
        <div className="table-toolbar">
          <div className="toolbar-tabs">
            <button
              className={activeQueueFilter === 'ALL' ? 'active' : ''}
              onClick={() => setActiveQueueFilter('ALL')}
            >
              All Incidents ({stats.totalIncidents})
            </button>
            <button
              className={activeQueueFilter === 'OPEN' ? 'active' : ''}
              onClick={() => setActiveQueueFilter('OPEN')}
            >
              Open Queues ({stats.openCount})
            </button>
            <button
              className={activeQueueFilter === 'HIGH_CRITICAL' ? 'active' : ''}
              onClick={() => setActiveQueueFilter('HIGH_CRITICAL')}
            >
              High & Critical ({stats.highCriticalCount})
            </button>
            <button
              className={activeQueueFilter === 'ESCALATED' ? 'active' : ''}
              onClick={() => setActiveQueueFilter('ESCALATED')}
            >
              Escalated ({stats.escalatedCount})
            </button>
            <button
              className={activeQueueFilter === 'RESOLVED' ? 'active' : ''}
              onClick={() => setActiveQueueFilter('RESOLVED')}
            >
              Resolved ({stats.resolvedCount})
            </button>
          </div>

          <div className="table-search">
            <input
              type="text"
              placeholder="Search queue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="queue-search-input"
            />
          </div>
        </div>

        {filteredQueue.length === 0 ? (
          <div className="queue-empty-state">
            <p>No incidents match the selected queue filter or search query.</p>
          </div>
        ) : (
          <div className="dense-table-wrapper">
            <table className="dense-queue-table">
              <thead>
                <tr>
                  <th>TICKET #</th>
                  <th>PRIORITY</th>
                  <th>STATUS</th>
                  <th>CATEGORY</th>
                  <th>ISSUE TYPE</th>
                  <th>SUMMARY</th>
                  <th>CREATED</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((inc) => (
                  <tr key={inc.id} onClick={() => setInspectingIncidentId(inc.id)}>
                    <td className="font-mono ticket-cell">{inc.ticketNumber}</td>
                    <td>
                      <span className={`priority-badge ${getPriorityBadgeClass(inc.priority)}`}>
                        {inc.priority.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusBadgeClass(inc.status)}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td>
                      <span className="category-pill">{inc.category}</span>
                    </td>
                    <td className="issue-type-cell">{inc.issueType.replace(/_/g, ' ')}</td>
                    <td className="summary-cell">{inc.summary}</td>
                    <td className="font-mono time-cell">
                      {new Date(inc.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectingIncidentId(inc.id);
                        }}
                        className="btn-inspect-sm"
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Engineer Incident Inspector Modal */}
      {inspectingIncidentId && (
        <EngineerIncidentInspector
          incidentId={inspectingIncidentId}
          onClose={() => setInspectingIncidentId(null)}
          onSelectIncident={(targetId) => setInspectingIncidentId(targetId)}
          onRefreshStats={loadDashboardStats}
        />
      )}
    </div>
  );
};
