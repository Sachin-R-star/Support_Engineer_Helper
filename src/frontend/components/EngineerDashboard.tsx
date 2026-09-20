// Professional Enterprise SVG Icons
const IconOpenIncidents: React.FC<{ className?: string }> = ({ className = "icon-kpi" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const IconCriticalPriority: React.FC<{ className?: string }> = ({ className = "icon-kpi" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />
  </svg>
);

const IconEscalated: React.FC<{ className?: string }> = ({ className = "icon-kpi" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 11 12 6 7 11" />
    <line x1="12" y1="18" x2="12" y2="6" />
  </svg>
);

const IconResolved: React.FC<{ className?: string }> = ({ className = "icon-kpi" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconResolutionTime: React.FC<{ className?: string }> = ({ className = "icon-kpi" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconRelationships: React.FC<{ className?: string }> = ({ className = "icon-kpi" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const IconSearch: React.FC<{ className?: string }> = ({ className = "icon-kpi" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const EngineerDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Queue View Filters
  const [activeQueueFilter, setActiveQueueFilter] = useState<
    'ALL' | 'OPEN' | 'HIGH_CRITICAL' | 'ESCALATED' | 'RESOLVED' | 'RELATIONSHIPS'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Card Popup Modal State
  const [activeCardModal, setActiveCardModal] = useState<{
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    incidents: IncidentRecord[];
    filterType: string;
  } | null>(null);

  const [modalSearchQuery, setModalSearchQuery] = useState('');

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

  const handleCardClick = (type: 'OPEN' | 'HIGH_CRITICAL' | 'ESCALATED' | 'RESOLVED' | 'AVG_TIME' | 'RELATIONSHIPS') => {
    if (!stats) return;
    setModalSearchQuery('');
    
    switch (type) {
      case 'OPEN':
        setActiveCardModal({
          title: 'Open Incidents Queue',
          subtitle: 'Active triage & in-progress incidents requiring resolution',
          icon: <IconOpenIncidents />,
          incidents: stats.openIncidents,
          filterType: 'OPEN'
        });
        break;
      case 'HIGH_CRITICAL':
        setActiveCardModal({
          title: 'P1/P2 High & Critical Priority Incidents',
          subtitle: 'Critical severity tickets requiring immediate engineer attention',
          icon: <IconCriticalPriority />,
          incidents: stats.highCriticalIncidents,
          filterType: 'HIGH_CRITICAL'
        });
        break;
      case 'ESCALATED':
        setActiveCardModal({
          title: 'Escalated Support Tickets',
          subtitle: 'Escalated to Tier-2 engineers or vendor escalation channels',
          icon: <IconEscalated />,
          incidents: stats.escalatedIncidents,
          filterType: 'ESCALATED'
        });
        break;
      case 'RESOLVED':
        setActiveCardModal({
          title: 'Recently Resolved Incidents',
          subtitle: 'Successfully resolved tickets and confirmed outcomes',
          icon: <IconResolved />,
          incidents: stats.recentlyResolvedIncidents,
          filterType: 'RESOLVED'
        });
        break;
      case 'AVG_TIME':
        setActiveCardModal({
          title: 'Resolution Time Metrics & Resolved Queue',
          subtitle: stats.avgResolutionTimeMinutes !== null 
            ? `Average resolution time: ${stats.avgResolutionTimeMinutes} minutes based on actual ticket resolution timestamps` 
            : 'No resolved ticket data recorded yet',
          icon: <IconResolutionTime />,
          incidents: stats.recentlyResolvedIncidents,
          filterType: 'AVG_TIME'
        });
        break;
      case 'RELATIONSHIPS':
        const allInc = [...stats.openIncidents, ...stats.highCriticalIncidents, ...stats.recentlyResolvedIncidents, ...stats.escalatedIncidents];
        const uniqueIncMap = new Map<string, IncidentRecord>();
        allInc.forEach(i => uniqueIncMap.set(i.id, i));
        
        setActiveCardModal({
          title: 'Incident Relationships & Graph Linkages',
          subtitle: `${stats.relationshipSummary.confirmedCount} confirmed links, ${stats.relationshipSummary.proposedCount} AI proposed links`,
          icon: <IconRelationships />,
          incidents: Array.from(uniqueIncMap.values()),
          filterType: 'RELATIONSHIPS'
        });
        break;
    }
  };

  const handlePatternClick = (issueType: string) => {
    if (!stats) return;
    setModalSearchQuery('');
    const allInc = [...stats.openIncidents, ...stats.highCriticalIncidents, ...stats.recentlyResolvedIncidents, ...stats.escalatedIncidents];
    const matchingInc = allInc.filter(i => i.issueType.toLowerCase() === issueType.toLowerCase());

    setActiveCardModal({
      title: `Pattern Cluster: ${issueType.replace(/_/g, ' ')}`,
      subtitle: `Filtered list of incidents belonging to auto-detected pattern ${issueType}`,
      icon: <IconSearch />,
      incidents: matchingInc.length > 0 ? matchingInc : allInc,
      filterType: 'PATTERN'
    });
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
    case 'RELATIONSHIPS':
      queueIncidents = [...stats.openIncidents, ...stats.highCriticalIncidents, ...stats.recentlyResolvedIncidents, ...stats.escalatedIncidents];
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
          onClick={() => handleCardClick('OPEN')}
          title="Click to view all Open Incidents"
          role="button"
          tabIndex={0}
        >
          <div className="kpi-top">
            <span className="kpi-title">Open Incidents</span>
            <span className="kpi-icon-badge color-blue"><IconOpenIncidents /></span>
          </div>
          <div className="kpi-val font-mono">{stats.openCount}</div>
          <div className="kpi-sub">Active triage & in-progress</div>
        </div>

        <div
          className={`kpi-card ${activeQueueFilter === 'HIGH_CRITICAL' ? 'selected' : ''}`}
          onClick={() => handleCardClick('HIGH_CRITICAL')}
          title="Click to view High & Critical Priority Tickets"
          role="button"
          tabIndex={0}
        >
          <div className="kpi-top">
            <span className="kpi-title">P1/P2 High & Critical</span>
            <span className="kpi-icon-badge color-red"><IconCriticalPriority /></span>
          </div>
          <div className="kpi-val font-mono text-red">{stats.highCriticalCount}</div>
          <div className="kpi-sub">Priority attention required</div>
        </div>

        <div
          className={`kpi-card ${activeQueueFilter === 'ESCALATED' ? 'selected' : ''}`}
          onClick={() => handleCardClick('ESCALATED')}
          title="Click to view Escalated Tickets"
          role="button"
          tabIndex={0}
        >
          <div className="kpi-top">
            <span className="kpi-title">Escalated Tickets</span>
            <span className="kpi-icon-badge color-orange"><IconEscalated /></span>
          </div>
          <div className="kpi-val font-mono text-orange">{stats.escalatedCount}</div>
          <div className="kpi-sub">Tier 2 / Vendor escalation</div>
        </div>

        <div
          className={`kpi-card ${activeQueueFilter === 'RESOLVED' ? 'selected' : ''}`}
          onClick={() => handleCardClick('RESOLVED')}
          title="Click to view Recently Resolved Tickets"
          role="button"
          tabIndex={0}
        >
          <div className="kpi-top">
            <span className="kpi-title">Recently Resolved</span>
            <span className="kpi-icon-badge color-green"><IconResolved /></span>
          </div>
          <div className="kpi-val font-mono text-green">{stats.resolvedCount}</div>
          <div className="kpi-sub">Completed resolutions</div>
        </div>

        <div 
          className={`kpi-card ${activeQueueFilter === 'RESOLVED' ? 'selected' : ''}`}
          onClick={() => handleCardClick('RESOLVED')}
          title="Click to view Resolution metrics and resolved tickets"
          role="button"
          tabIndex={0}
        >
          <div className="kpi-top">
            <span className="kpi-title">Avg Resolution Time</span>
            <span className="kpi-icon-badge color-purple"><IconResolutionTime /></span>
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

        <div 
          className={`kpi-card ${activeQueueFilter === 'RELATIONSHIPS' ? 'selected' : ''}`}
          onClick={() => handleCardClick('RELATIONSHIPS')}
          title="Click to view Linked Incidents & Graph Links"
          role="button"
          tabIndex={0}
        >
          <div className="kpi-top">
            <span className="kpi-title">Incident Relationships</span>
            <span className="kpi-icon-badge color-indigo"><IconRelationships /></span>
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
            <span className="empty-icon-badge"><IconSearch /></span>
            <p>No recurring issue patterns (count ≥ 2) detected in ticket volume.</p>
          </div>
        ) : (
          <div className="pattern-cards-grid">
            {realPatterns.map((pat, idx) => (
              <div 
                key={idx} 
                className="pattern-card"
                onClick={() => handlePatternClick(pat.issueType)}
                title={`Click to filter queue by pattern: ${pat.issueType}`}
                role="button"
                tabIndex={0}
              >
                <div className="pattern-top">
                  <span className="pattern-count-badge font-mono">{pat.count} Occurrences</span>
                  <span className="category-pill">{pat.category}</span>
                </div>
                <h4 className="pattern-name">{pat.issueType.replace(/_/g, ' ')}</h4>
                <div className="pattern-footer">
                  <span className="pattern-label font-mono">Clustered Pattern →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* High-Density Support Queue Table */}
      <div className="dashboard-section-card" id="support-queue-section">
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

      {/* KPI Card Interactive Filter Modal Dialog Popup */}
      {activeCardModal && (
        <div className="kpi-modal-backdrop" onClick={() => setActiveCardModal(null)}>
          <div className="kpi-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="kpi-modal-header">
              <div className="modal-title-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="kpi-icon-badge color-indigo" style={{ width: '32px', height: '32px' }}>
                  {activeCardModal.icon}
                </span>
                <div>
                  <h3 style={{ fontSize: '1.15rem', color: '#ffffff', margin: 0 }}>{activeCardModal.title}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{activeCardModal.subtitle}</p>
                </div>
              </div>
              <button 
                className="kpi-modal-close-btn" 
                onClick={() => setActiveCardModal(null)}
                title="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="kpi-modal-toolbar" style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {activeCardModal.incidents.length} INCIDENT{activeCardModal.incidents.length !== 1 ? 'S' : ''} RECORDED
              </span>
              <input
                type="text"
                placeholder="Filter modal list..."
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                className="queue-search-input"
                style={{ maxWidth: '240px' }}
              />
            </div>

            <div className="kpi-modal-body">
              {(() => {
                const modalFiltered = activeCardModal.incidents.filter(inc => {
                  if (!modalSearchQuery) return true;
                  const q = modalSearchQuery.toLowerCase();
                  return (
                    inc.ticketNumber.toLowerCase().includes(q) ||
                    inc.summary.toLowerCase().includes(q) ||
                    inc.issueType.toLowerCase().includes(q) ||
                    inc.category.toLowerCase().includes(q)
                  );
                });

                if (modalFiltered.length === 0) {
                  return (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <p>No tickets available in this view matching "{modalSearchQuery || 'filter'}".</p>
                    </div>
                  );
                }

                return (
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
                          <th>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalFiltered.map((inc) => (
                          <tr key={inc.id} onClick={() => { setInspectingIncidentId(inc.id); }}>
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
                );
              })()}
            </div>
          </div>
        </div>
      )}

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
