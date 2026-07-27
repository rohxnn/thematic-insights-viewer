import React, { useState, useEffect } from 'react';
import VisualizationIframe from '../components/VisualizationIframe';
import { Play, Filter, Download, Info, Check, Search, ChevronRight, BarChart, Server } from 'lucide-react';

export default function VisualizationHub() {
  const [thresholds, setThresholds] = useState([]);
  const [threshold, setThreshold] = useState('');
  const [chartType, setChartType] = useState('docMap');
  const [meta, setMeta] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [explorerLoading, setExplorerLoading] = useState(false);

  // Load dynamic thresholds on mount
  useEffect(() => {
    fetch('/thresholds.json')
      .then((res) => (res.ok ? res.json() : ['0.90', '0.65', '0.60']))
      .then((data) => {
        setThresholds(data);
        if (data.includes('0.60')) {
          setThreshold('0.60');
        } else if (data.length > 0) {
          setThreshold(data[0]);
        }
      })
      .catch(() => {
        const fallback = ['0.90', '0.65', '0.60'];
        setThresholds(fallback);
        setThreshold('0.60');
      });
  }, []);

  // Fetch Metadata & CSV Data on threshold change
  useEffect(() => {
    if (!threshold) return;

    // 1. Fetch metadata
    fetch(`/visualizations/${threshold}_review_visualizations/run_meta.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMeta(data))
      .catch(() => setMeta(null));

    // 2. Fetch & parse CSV
    setExplorerLoading(true);
    fetch(`/visualizations/${threshold}_review_visualizations/tritopic_review.csv`)
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (!text) {
          setCsvData([]);
          setExplorerLoading(false);
          return;
        }
        const parsed = parseTritopicCSV(text);
        setCsvData(parsed);
        // Reset selected theme or pick the first one
        if (parsed.length > 0) {
          setSelectedTheme(parsed[0]);
        } else {
          setSelectedTheme(null);
        }
        setExplorerLoading(false);
      })
      .catch(() => {
        setCsvData([]);
        setExplorerLoading(false);
      });
  }, [threshold]);

  // Basic CSV Parser that handles double quotes and escapes
  const parseTritopicCSV = (text) => {
    const lines = text.split(/\r?\n/);
    const result = [];
    if (lines.length <= 1) return result;

    const headers = parseCSVLine(lines[0]);
    
    // Find column indices
    const idIdx = headers.findIndex(h => h.toLowerCase() === 'theme id');
    const nameIdx = headers.findIndex(h => h.toLowerCase() === 'theme name');
    const defIdx = headers.findIndex(h => h.toLowerCase() === 'defination' || h.toLowerCase() === 'definition');
    const keysIdx = headers.findIndex(h => h.toLowerCase() === 'keywords');
    const statusIdx = headers.findIndex(h => h.toLowerCase() === 'status');
    const countIdx = headers.findIndex(h => h.toLowerCase() === 'objective count' || h.toLowerCase() === 'challenge count');
    const stmtsIdx = headers.findIndex(h => h.toLowerCase() === 'original statements');

    let currentThemeId = "";
    let currentThemeName = "";
    let currentDef = "";
    let currentKeys = "";
    let currentStatus = "";
    let currentCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const cols = parseCSVLine(line);
      if (cols.length === 0) continue;

      // Forward-fill theme level columns
      if (cols[idIdx] && cols[idIdx].trim()) currentThemeId = cols[idIdx].trim();
      if (cols[nameIdx] && cols[nameIdx].trim()) currentThemeName = cols[nameIdx].trim();
      if (cols[defIdx] && cols[defIdx].trim()) currentDef = cols[defIdx].trim();
      if (cols[keysIdx] && cols[keysIdx].trim()) currentKeys = cols[keysIdx].trim();
      if (cols[statusIdx] && cols[statusIdx].trim()) currentStatus = cols[statusIdx].trim();
      if (cols[countIdx] && cols[countIdx].trim()) currentCount = parseInt(cols[countIdx].trim()) || 0;

      const stmtsText = cols[stmtsIdx] ? cols[stmtsIdx].trim() : '';

      // We group rows by theme
      const existing = result.find(r => r.themeName === currentThemeName);
      if (existing) {
        if (stmtsText) {
          existing.rawStatements.push(stmtsText);
        }
      } else {
        result.push({
          themeId: currentThemeId,
          themeName: currentThemeName,
          definition: currentDef,
          keywords: currentKeys,
          status: currentStatus,
          count: currentCount,
          rawStatements: stmtsText ? [stmtsText] : []
        });
      }
    }

    return result;
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  // Process statements for the inspector panel
  const getMappedStatements = (theme) => {
    if (!theme || !theme.rawStatements) return [];
    const rows = [];
    theme.rawStatements.forEach((stmt) => {
      const parts = String(stmt).split(' | ');
      if (parts.length >= 2) {
        const stmtId = parts[0].trim();
        for (let i = 1; i < parts.length; i += 2) {
          const textPart = parts[i] ? parts[i].trim() : '';
          const scorePart = parts[i + 1] ? parts[i + 1].trim() : null;
          const scoreVal = scorePart ? parseFloat(scorePart) : null;
          if (textPart) {
            rows.push({
              id: stmtId,
              text: textPart,
              score: scoreVal
            });
          }
        }
      } else if (stmt.trim()) {
        rows.push({
          id: '—',
          text: stmt.trim(),
          score: null
        });
      }
    });

    // Sort statements in descending order of match score (highest score first)
    rows.sort((a, b) => {
      if (a.score !== null && b.score !== null) {
        return b.score - a.score;
      }
      if (a.score !== null) return -1;
      if (b.score !== null) return 1;
      return 0;
    });

    return rows;
  };
  const totalThemesCount = csvData.length;
  const approvedThemesCount = csvData.filter(t => t.status.toLowerCase() === 'approved').length;
  const draftThemesCount = csvData.filter(t => t.status.toLowerCase() === 'draft').length;

  const filteredThemes = csvData.filter((theme) => {
    const nameMatch = theme.themeName.toLowerCase().includes(searchTerm.toLowerCase());
    const keysMatch = theme.keywords.toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || keysMatch;
  });

  const activeStatements = getMappedStatements(selectedTheme);

  const handleExportCSV = () => {
    const totalValid = meta?.total_valid_objectives || meta?.total_mapped || csvData.reduce((acc, t) => acc + (t.count || 0), 0);
    const headers = [
      'Theme ID',
      'Theme Name',
      'Status',
      'Definition',
      'Keywords',
      'Challenge Count',
      '% of Total Valid',
      'Statement ID',
      'Statement Text',
      'Similarity Score'
    ];

    const rows = [headers];

    filteredThemes.forEach((theme) => {
      const statements = getMappedStatements(theme);
      const themeId = theme.themeId || '';
      const themeName = theme.themeName || '';
      const status = theme.status || '';
      const definition = theme.definition || '';
      const keywords = theme.keywords || '';
      const count = theme.count || 0;
      const pct = totalValid > 0 ? ((count / totalValid) * 100).toFixed(2) + '%' : '0.00%';

      if (statements.length === 0) {
        rows.push([
          themeId,
          themeName,
          status,
          definition,
          keywords,
          count,
          pct,
          '',
          '',
          ''
        ]);
      } else {
        statements.forEach((stmt) => {
          rows.push([
            themeId,
            themeName,
            status,
            definition,
            keywords,
            count,
            pct,
            stmt.id || '',
            stmt.text || '',
            stmt.score !== null ? stmt.score : ''
          ]);
        });
      }
    });

    const csvContent = rows
      .map((row) =>
        row
          .map((val) => {
            const str = String(val === null || val === undefined ? '' : val);
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `thematic_explorer_export_threshold_${threshold}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!threshold) {
    return (
      <div className="loader-container">
        <div className="loader-spinner" />
        <p>Loading threshold configurations...</p>
      </div>
    );
  }

  return (
    <div className="viz-hub-container fade-in-slide">
      <div className="viz-header">
        <h1>📊 Visualization Hub</h1>
        <p>Analyze semantic boundaries, clusters, and run outputs across similarity thresholds</p>
      </div>

      {/* Selectors Panel */}
      <div className="selector-panel glass-panel">
        <div className="selector-group">
          <label>🎚️ Similarity Threshold</label>
          <div className="tab-buttons">
            {thresholds.map((val) => (
              <button
                key={val}
                onClick={() => setThreshold(val)}
                className={`tab-btn ${threshold === val ? 'active' : ''}`}
              >
                Threshold {val}
              </button>
            ))}
          </div>
        </div>

        <div className="selector-group">
          <label>🗺️ Chart Selection</label>
          <div className="tab-buttons">
            {[
              { id: 'docMap', label: '2D Document Map' },
              { id: 'hierarchy', label: 'Topic Hierarchy' },
              { id: 'similarity', label: 'Centroid Similarity' },
            ].map((chart) => (
              <button
                key={chart.id}
                onClick={() => setChartType(chart.id)}
                className={`tab-btn ${chartType === chart.id ? 'active' : ''}`}
              >
                {chart.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Dashboard */}
      {meta && (
        <div className="glass-panel stats-panel fade-in-slide" key={threshold}>
          <div className="panel-header">
            <Server size={18} />
            <h3>Run Statistics for Threshold {threshold}</h3>
            {meta.run_timestamp && <span className="timestamp">📅 Run: {meta.run_timestamp.replace('T', ' ')}</span>}
          </div>
          
          <div className="stats-section-title">📋 Run Statistics</div>
          <div className="metrics-grid metrics-5-col">
            <div className="metric-card">
              <span className="metric-label">Total CSV Rows</span>
              <span className="metric-value">{(meta.total_objectives_in_csv || 0).toLocaleString()}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Total Rows Processed</span>
              <span className="metric-value">{(meta.total_objectives_processed || 0).toLocaleString()}</span>
            </div>
            <div className="metric-card success">
              <span className="metric-label">Total Valid Challenges</span>
              <span className="metric-value">{(meta.total_valid_objectives || meta.total_mapped || 0).toLocaleString()}</span>
            </div>
            <div className="metric-card warning">
              <span className="metric-label">Skipped (Non-English)</span>
              <span className="metric-value">{(meta.skipped_non_english || 0).toLocaleString()}</span>
            </div>
            <div className="metric-card warning">
              <span className="metric-label">Skipped (Empty)</span>
              <span className="metric-value">{(meta.skipped_empty || 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="metrics-grid metrics-4-col" style={{ marginTop: '1.25rem' }}>
            <div className="metric-card success">
              <span className="metric-label">Mapped to Approved Themes</span>
              <span className="metric-value">{(meta.mapped_to_approved_themes || 0).toLocaleString()}</span>
            </div>
            <div className="metric-card warning">
              <span className="metric-label">Unmapped Challenges</span>
              <span className="metric-value">{(meta.unmapped_after_approved || 0).toLocaleString()}</span>
            </div>
            <div className="metric-card accent">
              <span className="metric-label">New Candidate Clusters</span>
              <span className="metric-value">{(meta.draft_clusters_identified || 0).toLocaleString()}</span>
            </div>
            <div className="metric-card accent">
              <span className="metric-label">Clusters &gt; 10 Challenges</span>
              <span className="metric-value">{(meta.clusters_gt_10 || 0).toLocaleString()}</span>
            </div>
          </div>

          <div className="stats-section-title" style={{ marginTop: '2rem' }}>🏷️ Theme Summary</div>
          <div className="metrics-grid metrics-4-col">
            <div className="metric-card accent">
              <span className="metric-label">Similarity Threshold</span>
              <span className="metric-value">{threshold}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Total Themes</span>
              <span className="metric-value">{approvedThemesCount + (meta.draft_clusters_identified || 0)}</span>
            </div>
            <div className="metric-card success">
              <span className="metric-label">Approved Themes</span>
              <span className="metric-value">{approvedThemesCount}</span>
            </div>
            <div className="metric-card warning">
              <span className="metric-label">Draft Candidate Themes</span>
              <span className="metric-value">{meta.draft_clusters_identified}</span>
            </div>
          </div>

          <div className="meta-footer-details" style={{ marginTop: '1.5rem' }}>
            <span>Tokens Utilized: <strong>{(meta.llm_total_tokens || 0).toLocaleString()}</strong> (Prompt: {(meta.llm_prompt_tokens || 0).toLocaleString()} · Completion: {(meta.llm_completion_tokens || 0).toLocaleString()})</span>
          </div>
        </div>
      )}

      {/* Active Chart Area */}
      <VisualizationIframe threshold={threshold} chartType={chartType} />

      {/* Themes Explorer Table */}
      <div className="themes-explorer-section">
        <div className="explorer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>📁 Dynamic Themes Explorer</h2>
            <p>Inspect parsed thematic mappings and statements for active threshold</p>
          </div>
          <button onClick={handleExportCSV} className="export-btn">
            <Download size={16} />
            Export CSV
          </button>
        </div>

        <div className="explorer-layout">
          {/* Themes Table Pane */}
          <div className="themes-table-pane glass-panel">
            <div className="table-search-bar">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search themes or keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {explorerLoading ? (
              <div className="pane-loader">
                <div className="loader-spinner" />
                <p>Parsing CSV output...</p>
              </div>
            ) : (
              <div className="themes-list-wrapper">
                {filteredThemes.length === 0 ? (
                  <p className="no-results">No themes match search criteria.</p>
                ) : (
                  <table className="themes-table">
                    <thead>
                      <tr>
                        <th>Theme Name</th>
                        <th>Status</th>
                        <th>Size</th>
                        <th>% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredThemes.map((theme) => {
                        const isSelected = selectedTheme && selectedTheme.themeName === theme.themeName;
                        const totalValid = meta?.total_valid_objectives || meta?.total_mapped || csvData.reduce((acc, t) => acc + (t.count || 0), 0);
                        const pctVal = totalValid > 0 ? ((theme.count / totalValid) * 100).toFixed(2) : '0.00';
                        return (
                          <tr
                            key={theme.themeName}
                            onClick={() => setSelectedTheme(theme)}
                            className={isSelected ? 'selected' : ''}
                          >
                            <td>
                              <div className="theme-table-cell">
                                <span className="theme-cell-title">{theme.themeName}</span>
                                <span className="theme-cell-desc">{theme.definition.substring(0, 75)}...</span>
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${theme.status.toLowerCase() === 'approved' ? 'badge-approved' : 'badge-draft'}`}>
                                {theme.status}
                              </span>
                            </td>
                            <td>
                              <span className="theme-cell-count">{theme.count}</span>
                            </td>
                            <td>
                              <span className="theme-cell-pct">{pctVal}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Statement Inspector Pane */}
          <div className="inspector-pane glass-panel">
            {selectedTheme ? (
              <div className="inspector-wrapper fade-in-slide" key={selectedTheme.themeName}>
                <div className="inspector-title-area">
                  <span className={`badge ${selectedTheme.status.toLowerCase() === 'approved' ? 'badge-approved' : 'badge-draft'}`}>
                    {selectedTheme.status} Theme
                  </span>
                  <h3>{selectedTheme.themeName}</h3>
                </div>
                <div className="inspector-metadata">
                  <p><strong>Definition:</strong> {selectedTheme.definition}</p>
                  <p><strong>Keywords:</strong> <span className="keywords-list">{selectedTheme.keywords}</span></p>
                </div>

                <div className="inspector-statements">
                  <h4>Mapped Statements ({activeStatements.length})</h4>
                  <div className="statements-list">
                    {activeStatements.length === 0 ? (
                      <p className="no-statements">No statements mapped directly to this theme.</p>
                    ) : (
                      activeStatements.map((stmt, idx) => (
                        <div className="statement-item" key={idx}>
                          <div className="stmt-item-header">
                            <span className="stmt-id">ID: {stmt.id}</span>
                            {stmt.score !== null && (
                              <span className="stmt-score">
                                Match: {(stmt.score * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <p className="stmt-text">{stmt.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="inspector-placeholder">
                <Info size={32} />
                <p>Select a theme from the left table to inspect mapped statements and scores.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .viz-hub-container {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .viz-header h1 {
          color: var(--text-primary);
        }

        .selector-panel {
          display: flex;
          gap: 2rem;
          flex-wrap: wrap;
        }

        .selector-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .selector-group label {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .tab-buttons {
          display: flex;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 3px;
        }

        .tab-buttons .tab-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          padding: 0.6rem 1.2rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          border-radius: 8px;
          transition: all var(--transition-speed);
        }

        .tab-buttons .tab-btn:hover {
          color: var(--text-primary);
        }

        .tab-buttons .tab-btn.active {
          background: var(--bg-app);
          color: var(--color-primary);
          box-shadow: var(--shadow-premium);
        }

        .stats-panel {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .panel-header h3 {
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .panel-header .timestamp {
          margin-left: auto;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .meta-footer-details {
          display: flex;
          gap: 2rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
          border-top: 1px solid var(--border-color);
          padding-top: 0.75rem;
        }

        .meta-footer-details strong {
          color: var(--text-primary);
        }

        .themes-explorer-section {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .explorer-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          min-height: 550px;
        }

        @media (max-width: 992px) {
          .explorer-layout {
            grid-template-columns: 1fr;
          }
        }

        .themes-table-pane {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          height: 600px;
          padding: 1.25rem;
        }

        .table-search-bar {
          position: relative;
          width: 100%;
        }

        .table-search-bar input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          padding: 0.75rem 1rem 0.75rem 2.5rem;
          border-radius: 10px;
          font-size: 0.9rem;
          font-family: var(--font-sans);
          outline: none;
          transition: all var(--transition-speed);
        }

        .table-search-bar input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.15);
        }

        .search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .pane-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          gap: 1rem;
          color: var(--text-secondary);
        }

        .themes-list-wrapper {
          overflow-y: auto;
          flex: 1;
        }

        .themes-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .themes-table th {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          padding: 0.5rem 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .themes-table tbody tr {
          cursor: pointer;
          transition: background-color var(--transition-speed);
          border-bottom: 1px solid var(--border-color);
        }

        .themes-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .themes-table tbody tr.selected {
          background: rgba(59, 130, 246, 0.08);
        }

        .theme-table-cell {
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .theme-cell-title {
          font-weight: 600;
          color: var(--text-primary);
          font-size: 0.925rem;
        }

        .theme-cell-desc {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .theme-cell-count {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.1rem;
          color: var(--text-primary);
          padding-right: 1rem;
        }

        .theme-cell-pct {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--color-primary);
          padding-right: 1rem;
        }

        .no-results {
          color: var(--text-muted);
          text-align: center;
          margin-top: 3rem;
          font-size: 0.95rem;
        }

        .inspector-pane {
          height: 600px;
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          overflow-y: auto;
        }

        .inspector-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          gap: 1rem;
          color: var(--text-muted);
          text-align: center;
          max-width: 320px;
          margin: 0 auto;
        }

        .inspector-placeholder p {
          font-size: 0.9rem;
        }

        .inspector-wrapper {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .inspector-title-area {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: flex-start;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 1rem;
        }

        .inspector-title-area h3 {
          font-size: 1.5rem;
          font-family: var(--font-display);
          color: var(--text-primary);
        }

        .inspector-metadata {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .keywords-list {
          font-style: italic;
          color: var(--color-primary);
        }

        .inspector-statements {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .inspector-statements h4 {
          font-size: 0.95rem;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .statements-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-height: 280px;
          overflow-y: auto;
          padding-right: 0.25rem;
        }

        .statement-item {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .stmt-item-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .stmt-id {
          color: var(--text-muted);
        }

        .stmt-score {
          color: var(--color-success);
        }

        .stmt-text {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .no-statements {
          color: var(--text-muted);
          text-align: center;
          padding: 2rem 0;
          font-size: 0.9rem;
        }

        .stats-section-title {
          font-family: var(--font-display);
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.75rem;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.25rem;
        }

        .metrics-5-col {
          grid-template-columns: repeat(5, 1fr);
        }

        .metrics-4-col {
          grid-template-columns: repeat(4, 1fr);
        }

        @media (max-width: 1200px) {
          .metrics-5-col {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }
          .metrics-4-col {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }
        }

        .export-btn {
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          color: var(--color-primary);
          padding: 0.6rem 1.2rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: all var(--transition-speed);
        }

        .export-btn:hover {
          background: var(--color-primary);
          color: white;
          box-shadow: var(--shadow-premium);
        }
      `}} />
    </div>
  );
}
