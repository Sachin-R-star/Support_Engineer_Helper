import React, { useEffect, useState } from 'react';
import { IncidentRecord } from '../types/triage';
import { ApiClient } from '../services/apiClient';
import { IncidentListView } from './IncidentListView';
import { IncidentDetailView } from './IncidentDetailView';

interface IncidentHistoryProps {
  userId?: string;
  onStartFollowUpTriage?: (incident: IncidentRecord) => void;
}

export const IncidentHistory: React.FC<IncidentHistoryProps> = ({
  userId,
  onStartFollowUpTriage
}) => {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state for Detail view and Navigation Stack
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);

  useEffect(() => {
    loadIncidents();
  }, [userId]);

  const loadIncidents = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.fetchIncidents(userId);
      setIncidents(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load incident history');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFromList = (incidentId: string) => {
    setSelectedIncidentId(incidentId);
    setNavigationHistory([incidentId]);
  };

  const handleNavigateToIncident = (targetIncidentId: string) => {
    setSelectedIncidentId(targetIncidentId);
    setNavigationHistory((prev) => [...prev, targetIncidentId]);
  };

  const handleBackToList = () => {
    if (navigationHistory.length > 1) {
      const newHistory = [...navigationHistory];
      newHistory.pop();
      setNavigationHistory(newHistory);
      setSelectedIncidentId(newHistory[newHistory.length - 1]);
    } else {
      setSelectedIncidentId(null);
      setNavigationHistory([]);
    }
  };

  if (loading) {
    return <div className="history-loading">Loading IT Incident History & Memory System...</div>;
  }

  if (error) {
    return (
      <div className="history-error-card">
        <p className="error-title">Unable to fetch incident history</p>
        <p className="error-body">{error}</p>
        <button onClick={loadIncidents} className="btn-primary">
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="incident-history-container">
      {selectedIncidentId ? (
        <IncidentDetailView
          incidentId={selectedIncidentId}
          onNavigateToIncident={handleNavigateToIncident}
          onBackToList={handleBackToList}
          onStartFollowUpTriage={onStartFollowUpTriage}
          navigationHistory={navigationHistory}
        />
      ) : (
        <IncidentListView
          incidents={incidents}
          onSelectIncident={handleSelectFromList}
          onRefresh={loadIncidents}
        />
      )}
    </div>
  );
};
