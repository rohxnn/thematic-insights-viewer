import React, { useState, useEffect } from 'react';
import { Presentation, Layers, Activity, Gauge, Sun, Moon } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const navItems = [
    { id: 'presentation', label: 'Slide Deck', icon: Presentation },
    { id: 'visualizations', label: 'Visualization Hub', icon: Layers },
    { id: 'playground', label: 'Comparison Playground', icon: Activity },
    { id: 'smart-dashboard', label: 'Smart Dashboard', icon: Gauge },
  ];

  return (
    <aside className="sidebar-container">
      <div className="sidebar-brand">
        <div className="brand-logo">📊</div>
        <div className="brand-text">
          <h2>Thematic Portal</h2>
          <p>AI Analysis Engine</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`sidebar-nav-btn ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} className="nav-btn-icon" />
              <span>{item.label}</span>
              {isActive && <div className="active-indicator" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button onClick={toggleTheme} className="theme-toggle-btn" title="Toggle Light/Dark Mode">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar-container {
          width: 280px;
          background: var(--bg-sidebar);
          backdrop-filter: var(--glass-blur);
          -webkit-backdrop-filter: var(--glass-blur);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          padding: 2rem 1.5rem;
          height: 100vh;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 3rem;
        }

        .brand-logo {
          font-size: 2.25rem;
          line-height: 1;
        }

        .brand-text h2 {
          font-size: 1.25rem;
          font-family: var(--font-display);
          color: var(--text-primary);
        }

        .brand-text p {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1;
        }

        .sidebar-nav-btn {
          width: 100%;
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-secondary);
          padding: 0.85rem 1rem;
          font-size: 0.95rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.85rem;
          cursor: pointer;
          border-radius: 12px;
          transition: all var(--transition-speed);
          position: relative;
          text-align: left;
        }

        .sidebar-nav-btn:hover {
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
        }

        .sidebar-nav-btn.active {
          background: rgba(59, 130, 246, 0.12);
          border-color: rgba(59, 130, 246, 0.15);
          color: var(--color-primary);
          font-weight: 600;
        }

        .nav-btn-icon {
          flex-shrink: 0;
        }

        .active-indicator {
          position: absolute;
          right: 8px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-primary);
          box-shadow: 0 0 10px var(--color-primary);
        }

        .sidebar-footer {
          margin-top: auto;
          border-top: 1px solid var(--border-color);
          padding-top: 1.5rem;
        }

        .theme-toggle-btn {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          border-radius: 10px;
          cursor: pointer;
          transition: all var(--transition-speed);
        }

        .theme-toggle-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }
      `}} />
    </aside>
  );
}
