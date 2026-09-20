import React, { useState, useEffect } from 'react';
import { TriageFlow } from './components/TriageFlow';
import { IncidentHistory } from './components/IncidentHistory';
import { EngineerDashboard } from './components/EngineerDashboard';
import { CommandPalette } from './components/CommandPalette';
import './index.css';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'triage' | 'history'>('dashboard');
  const [initialTriageQuery, setInitialTriageQuery] = useState<string | undefined>(undefined);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const activeUserId = 'usr_exec_01'; // Default test user: Alex Morgan (Executive VIP)

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleStartFollowUp = (incident: { ticketNumber: string; summary: string }) => {
    setInitialTriageQuery(`Follow-up to ${incident.ticketNumber}: ${incident.summary}`);
    setActiveTab('triage');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="logo-icon logo-circle" style={{ borderRadius: '50%', width: '54px', height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', border: '2px solid rgba(255, 255, 255, 0.4)', padding: '2px', overflow: 'hidden', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)', flexShrink: 0 }}>
            <img src="/logo.svg" alt="IT Support Triage Logo" width="50" height="50" style={{ borderRadius: '50%', objectFit: 'cover', width: '100%', height: '100%' }} />
          </div>
          <div>
            <h1>Enterprise IT Support Triage</h1>
            <span className="sub-brand">AI-Powered ITSM Diagnostic Assistant</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="header-cmd-badge"
            title="Open Command Palette (⌘K / Ctrl+K)"
            aria-label="Open Command Palette"
          >
            <span>{typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</span>
          </button>

          <nav className="nav-tabs">
            <button 
              className={activeTab === 'dashboard' ? 'active' : ''} 
              onClick={() => setActiveTab('dashboard')}
            >
              Engineer Dashboard
            </button>
            <button 
              className={activeTab === 'triage' ? 'active' : ''} 
              onClick={() => setActiveTab('triage')}
            >
              New Triage Session
            </button>
            <button 
              className={activeTab === 'history' ? 'active' : ''} 
              onClick={() => setActiveTab('history')}
            >
              Incident History & Linker
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'dashboard' ? (
          <EngineerDashboard />
        ) : activeTab === 'triage' ? (
          <TriageFlow
            userId={activeUserId}
            deviceId="dev_mac_01"
            initialQuery={initialTriageQuery}
            onQueryConsumed={() => setInitialTriageQuery(undefined)}
          />
        ) : (
          <IncidentHistory
            userId={activeUserId}
            onStartFollowUpTriage={handleStartFollowUp}
          />
        )}
      </main>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={tab => setActiveTab(tab)}
        onSelectQuery={query => setInitialTriageQuery(query)}
      />
    </div>
  );
};

export default App;


