import React, { useState, useEffect } from 'react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: 'dashboard' | 'triage' | 'history') => void;
  onSelectQuery?: (query: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onSelectQuery
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commandItems = [
    {
      id: 'nav_triage',
      title: 'New Triage Session',
      subtitle: 'Start progressive AI triage from natural language input',
      icon: '⚡',
      category: 'Navigation',
      action: () => {
        onSelectTab('triage');
        onClose();
      }
    },
    {
      id: 'nav_dashboard',
      title: 'Engineer Operations Dashboard',
      subtitle: 'View active queue, metrics, inspector drawer & pattern alerts',
      icon: '📊',
      category: 'Navigation',
      action: () => {
        onSelectTab('dashboard');
        onClose();
      }
    },
    {
      id: 'nav_history',
      title: 'Incident History & Linker',
      subtitle: 'Browse ticket memory and interactive relationship graph',
      icon: '📜',
      category: 'Navigation',
      action: () => {
        onSelectTab('history');
        onClose();
      }
    },
    {
      id: 'sample_vpn',
      title: 'Preset: VPN Disconnect Issue',
      subtitle: 'GlobalProtect VPN times out every 5 minutes',
      icon: '🔒',
      category: 'Quick Presets',
      action: () => {
        if (onSelectQuery) onSelectQuery('GlobalProtect VPN times out every 5 minutes');
        onSelectTab('triage');
        onClose();
      }
    },
    {
      id: 'sample_sso',
      title: 'Preset: SSO Account Lockout',
      subtitle: 'Password expired and Okta SSO account locked out',
      icon: '🔑',
      category: 'Quick Presets',
      action: () => {
        if (onSelectQuery) onSelectQuery('Password expired and Okta SSO account locked out');
        onSelectTab('triage');
        onClose();
      }
    },
    {
      id: 'sample_outlook',
      title: 'Preset: Outlook Disconnected',
      subtitle: 'Outlook app disconnected after password update',
      icon: '📧',
      category: 'Quick Presets',
      action: () => {
        if (onSelectQuery) onSelectQuery('Outlook app disconnected after password update');
        onSelectTab('triage');
        onClose();
      }
    }
  ];

  const filteredItems = commandItems.filter(
    item =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredItems, onClose]);

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" onClick={e => e.stopPropagation()}>
        {/* Search Header Input */}
        <div className="cmd-search-header">
          <svg className="cmd-search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className="cmd-search-input"
            placeholder="Type a command or preset issue..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            autoFocus
          />
          <kbd className="cmd-esc-tag">ESC</kbd>
        </div>

        {/* Results List */}
        <div className="cmd-results-list">
          {filteredItems.length === 0 ? (
            <div className="cmd-empty-state">
              No matching commands or presets found.
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`cmd-item ${isSelected ? 'cmd-item-selected' : ''}`}
                >
                  <div className="cmd-item-left">
                    <span className="cmd-item-icon">{item.icon}</span>
                    <div>
                      <div className="cmd-item-title">{item.title}</div>
                      <div className="cmd-item-subtitle">{item.subtitle}</div>
                    </div>
                  </div>
                  <span className="cmd-item-category">{item.category}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Command Palette Footer */}
        <div className="cmd-palette-footer">
          <div className="cmd-footer-shortcuts">
            <span><kbd>↑↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
          </div>
          <div>Enterprise Triage Assistant v1.0</div>
        </div>
      </div>
    </div>
  );
};
