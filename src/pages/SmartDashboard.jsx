import React, { useState, useEffect, useMemo } from 'react';
import {
  Gauge, MapPin, CalendarRange, TrendingUp, PieChart as PieChartIcon,
  BarChart3, Table as TableIcon, Info, RefreshCw,
} from 'lucide-react';

// Show all 9 approved themes individually; draft/other themes fold into "Other themes"
const TOP_THEME_COUNT = 9;

// Trend chart window: >99% of parsed dates land in 2024-2026; a long tail of
// clearly mistyped dates (as early as 1997) would blow out the axis for <1%
// of rows, so the trend only plots this window and discloses what's excluded.
const TREND_START = '2024-01';

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const startOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const startInner = polarToCartesian(cx, cy, rInner, startAngle);
  const endInner = polarToCartesian(cx, cy, rInner, endAngle);
  return [
    'M', startOuter.x, startOuter.y,
    'A', rOuter, rOuter, 0, largeArc, 0, endOuter.x, endOuter.y,
    'L', startInner.x, startInner.y,
    'A', rInner, rInner, 0, largeArc, 1, endInner.x, endInner.y,
    'Z',
  ].join(' ');
}

function formatCompact(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function titleCase(s) {
  if (!s) return s;
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1));
}

function quarterOf(iso) {
  const month = parseInt(iso.slice(5, 7), 10);
  return `${iso.slice(0, 4)} Q${Math.ceil(month / 3)}`;
}

export default function SmartDashboard() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const [stateFilter, setStateFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [dateMode, setDateMode] = useState('all'); // 'all' | 'quarter' | 'range'
  const [quarterFilter, setQuarterFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const [tableSortAsc, setTableSortAsc] = useState(false);

  useEffect(() => {
    fetch('/data/dashboard_data.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('not ok'))))
      .then(setData)
      .catch(() => setLoadError(true));
  }, []);

  // districtIdx -> stateIdx (1:1 in this dataset — verified at data-prep time)
  const districtStateIdx = useMemo(() => {
    if (!data) return [];
    const map = new Array(data.districts.length).fill(null);
    data.rows.forEach((r) => { map[r[1]] = r[2]; });
    return map;
  }, [data]);

  const quarters = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    data.rows.forEach((r) => { if (r[3]) set.add(quarterOf(r[3])); });
    return Array.from(set).sort();
  }, [data]);

  const districtOptions = useMemo(() => {
    if (!data) return [];
    const stateIdx = stateFilter ? data.states.indexOf(stateFilter) : null;
    const names = data.districts
      .map((name, idx) => ({ idx, name }))
      .filter(({ idx }) => stateIdx === null || districtStateIdx[idx] === stateIdx)
      .map(({ name }) => name)
      .sort();
    return names;
  }, [data, stateFilter, districtStateIdx]);

  // Reset district filter if it no longer belongs to the selected state
  useEffect(() => {
    if (districtFilter && !districtOptions.includes(districtFilter)) {
      setDistrictFilter('');
    }
  }, [districtOptions, districtFilter]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const stateIdx = stateFilter ? data.states.indexOf(stateFilter) : null;
    const districtIdx = districtFilter ? data.districts.indexOf(districtFilter) : null;
    return data.rows.filter((r) => {
      if (stateIdx !== null && r[2] !== stateIdx) return false;
      if (districtIdx !== null && r[1] !== districtIdx) return false;
      if (dateMode === 'quarter' && quarterFilter) {
        if (!r[3] || quarterOf(r[3]) !== quarterFilter) return false;
      } else if (dateMode === 'range' && (startDate || endDate)) {
        if (!r[3]) return false;
        if (startDate && r[3] < startDate) return false;
        if (endDate && r[3] > endDate) return false;
      }
      return true;
    });
  }, [data, stateFilter, districtFilter, dateMode, quarterFilter, startDate, endDate]);

  const stats = useMemo(() => {
    if (!data) return null;
    const rows = filteredRows;
    const total = rows.length;
    const discussionSet = new Set();
    const themeCounts = new Map();
    const districtCounts = new Map();
    const monthCounts = new Map();
    let approvedCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let datedCount = 0;

    const districtDetailMap = new Map();
    const themeDistrictMap = new Map();

    rows.forEach(([themeIdx, districtIdx, , iso, sid, score]) => {
      if (sid != null) discussionSet.add(sid);
      themeCounts.set(themeIdx, (themeCounts.get(themeIdx) || 0) + 1);
      districtCounts.set(districtIdx, (districtCounts.get(districtIdx) || 0) + 1);

      let tDistMap = themeDistrictMap.get(themeIdx);
      if (!tDistMap) {
        tDistMap = new Map();
        themeDistrictMap.set(themeIdx, tDistMap);
      }
      tDistMap.set(districtIdx, (tDistMap.get(districtIdx) || 0) + 1);

      const isApproved = data.themeStatus[themeIdx] === 'Approved';
      if (isApproved) approvedCount++;
      if (score != null) { scoreSum += score; scoreCount++; }
      if (iso) {
        datedCount++;
        if (iso >= TREND_START) {
          const ym = iso.slice(0, 7);
          monthCounts.set(ym, (monthCounts.get(ym) || 0) + 1);
        }
      }

      let entry = districtDetailMap.get(districtIdx);
      if (!entry) {
        entry = { total: 0, approved: 0, themeCounts: new Map() };
        districtDetailMap.set(districtIdx, entry);
      }
      entry.total++;
      if (isApproved) entry.approved++;
      entry.themeCounts.set(themeIdx, (entry.themeCounts.get(themeIdx) || 0) + 1);
    });

    const themeRanked = Array.from(themeCounts.entries())
      .map(([idx, count]) => {
        const tDistMap = themeDistrictMap.get(idx) || new Map();
        const top5Districts = Array.from(tDistMap.entries())
          .map(([dIdx, dCount]) => ({
            districtName: titleCase(data.districts[dIdx]),
            stateName: titleCase(data.states[districtStateIdx[dIdx]]),
            count: dCount,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        return {
          idx,
          name: data.themes[idx],
          status: data.themeStatus[idx],
          count,
          top5Districts,
        };
      });

    // Prioritize approved themes for individual display; fold draft/unapproved themes into "Other themes"
    const approvedThemesRanked = themeRanked
      .filter((t) => t.status === 'Approved')
      .sort((a, b) => b.count - a.count);

    const topThemes = approvedThemesRanked.slice(0, TOP_THEME_COUNT);
    const nonTopApprovedCount = approvedThemesRanked.slice(TOP_THEME_COUNT).reduce((s, t) => s + t.count, 0);
    const draftThemesCount = themeRanked
      .filter((t) => t.status !== 'Approved')
      .reduce((s, t) => s + t.count, 0);

    const otherCount = nonTopApprovedCount + draftThemesCount;

    const districtRanked = Array.from(districtCounts.entries())
      .map(([idx, count]) => ({
        idx,
        name: titleCase(data.districts[idx]),
        state: titleCase(data.states[districtStateIdx[idx]]),
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const districtDetails = Array.from(districtDetailMap.entries()).map(([districtIdx, entry]) => {
      let topTheme = null;
      let topCount = 0;
      entry.themeCounts.forEach((c, idx) => {
        if (c > topCount) { topCount = c; topTheme = idx; }
      });
      return {
        districtIdx,
        district: titleCase(data.districts[districtIdx]),
        state: titleCase(data.states[districtStateIdx[districtIdx]]),
        total: entry.total,
        distinctThemes: entry.themeCounts.size,
        topThemeName: topTheme != null ? data.themes[topTheme] : '—',
        topThemeCount: topCount,
        approvedPct: entry.total ? Math.round((entry.approved / entry.total) * 100) : 0,
      };
    }).sort((a, b) => (tableSortAsc ? a.total - b.total : b.total - a.total));

    const trendMonths = Array.from(monthCounts.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => (a.month < b.month ? -1 : 1));
    const excludedFromTrend = datedCount - trendMonths.reduce((s, m) => s + m.count, 0);
    const undatedCount = total - datedCount;

    return {
      total,
      distinctDiscussions: discussionSet.size,
      distinctThemes: themeCounts.size,
      distinctDistricts: districtCounts.size,
      approvedCount,
      draftCount: total - approvedCount,
      approvedPct: total ? Math.round((approvedCount / total) * 100) : 0,
      avgScore: scoreCount ? scoreSum / scoreCount : null,
      topThemes,
      otherCount,
      districtRanked: districtRanked.slice(0, 10),
      districtDetails,
      trendMonths,
      excludedFromTrend: excludedFromTrend + undatedCount,
    };
  }, [data, filteredRows, districtStateIdx, tableSortAsc]);

  const resetFilters = () => {
    setStateFilter('');
    setDistrictFilter('');
    setDateMode('all');
    setQuarterFilter('');
    setStartDate('');
    setEndDate('');
  };

  if (loadError) {
    return (
      <div className="loader-container">
        <Info size={32} />
        <p>Could not load dashboard data. Make sure public/data/dashboard_data.json exists (run scripts/build_dashboard_data.py).</p>
      </div>
    );
  }

  if (!data || !stats) {
    return (
      <div className="loader-container">
        <div className="loader-spinner" />
        <p>Loading smart dashboard data...</p>
      </div>
    );
  }

  // --- Donut geometry ---
  const donutSlices = [];
  const donutTotal = stats.topThemes.reduce((s, t) => s + t.count, 0) + stats.otherCount;
  let angleCursor = 0;
  stats.topThemes.forEach((t, i) => {
    const pct = donutTotal ? (t.count / donutTotal) * 100 : 0;
    const sweep = donutTotal ? (t.count / donutTotal) * 360 : 0;
    const start = angleCursor;
    const end = angleCursor + sweep;
    const mid = (start + end) / 2;
    donutSlices.push({
      key: `theme-${t.idx}`,
      name: t.name,
      status: t.status,
      count: t.count,
      pct,
      path: donutSlicePath(100, 100, 90, 55, start, end),
      colorVar: `var(--series-${i + 1})`,
      labelPos: polarToCartesian(100, 100, 72, mid),
    });
    angleCursor = end;
  });
  if (stats.otherCount > 0) {
    const pct = donutTotal ? (stats.otherCount / donutTotal) * 100 : 0;
    const sweep = donutTotal ? (stats.otherCount / donutTotal) * 360 : 0;
    const start = angleCursor;
    const end = angleCursor + sweep;
    donutSlices.push({
      key: 'theme-other',
      name: 'Other themes',
      status: null,
      count: stats.otherCount,
      pct,
      path: donutSlicePath(100, 100, 90, 55, start, end),
      colorVar: 'var(--series-other)',
      labelPos: polarToCartesian(100, 100, 72, (start + end) / 2),
    });
  }

  const maxDistrictCount = stats.districtRanked.length ? stats.districtRanked[0].count : 0;
  const maxTrendCount = stats.trendMonths.length ? Math.max(...stats.trendMonths.map((m) => m.count)) : 0;

  return (
    <div className="smart-dashboard-container fade-in-slide">
      <div className="viz-header">
        <h1>🧭 Smart Dashboard</h1>
        <p>Filterable metrics across states, districts, and time — built from the themes explorer export</p>
      </div>

      {/* Global Filters */}
      <div className="glass-panel sd-filter-panel">
        <div className="sd-filter-group">
          <label><MapPin size={14} /> State</label>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="sd-select">
            <option value="">All States</option>
            {data.states.map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
        </div>

        <div className="sd-filter-group">
          <label><MapPin size={14} /> District</label>
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className="sd-select">
            <option value="">All Districts</option>
            {districtOptions.map((d) => (
              <option key={d} value={d}>{titleCase(d)}</option>
            ))}
          </select>
        </div>

        <div className="sd-filter-group sd-filter-group-wide">
          <label><CalendarRange size={14} /> Date</label>
          <div className="sd-date-controls">
            <div className="tab-buttons sd-mode-tabs">
              {[
                { id: 'all', label: 'All Time' },
                { id: 'quarter', label: 'Quarter' },
                { id: 'range', label: 'Range' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setDateMode(m.id)}
                  className={`tab-btn ${dateMode === m.id ? 'active' : ''}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {dateMode === 'quarter' && (
              <select value={quarterFilter} onChange={(e) => setQuarterFilter(e.target.value)} className="sd-select">
                <option value="">All Quarters</option>
                {quarters.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            )}

            {dateMode === 'range' && (
              <div className="sd-range-inputs">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <span>to</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <button onClick={resetFilters} className="btn-secondary sd-reset-btn">
          <RefreshCw size={15} />
          Reset
        </button>
      </div>

      {stats.total === 0 ? (
        <div className="glass-panel sd-empty-state">
          <Info size={32} />
          <p>No records match the selected filters. Try widening your date range or clearing a filter.</p>
        </div>
      ) : (
        <>
          {/* Big Numbers */}
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Total Challenges</span>
              <span className="metric-value">{stats.total.toLocaleString()}</span>
            </div>
            <div className="metric-card accent">
              <span className="metric-label">Distinct Discussions</span>
              <span className="metric-value">{stats.distinctDiscussions.toLocaleString()}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Themes Represented</span>
              <span className="metric-value">{stats.distinctThemes} <span className="metric-meta">/ {data.themes.length}</span></span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Districts Covered</span>
              <span className="metric-value">{stats.distinctDistricts} <span className="metric-meta">/ {data.districts.length}</span></span>
            </div>
            <div className="metric-card success">
              <span className="metric-label">Approved Share</span>
              <span className="metric-value">{stats.approvedPct}%</span>
            </div>
            <div className="metric-card warning">
              <span className="metric-label">Avg Similarity Score</span>
              <span className="metric-value">{stats.avgScore != null ? stats.avgScore.toFixed(2) : '—'}</span>
            </div>
          </div>

          {/* Theme Donut + Approved/Draft Meter */}
          <div className="sd-charts-grid">
            <div className="glass-panel sd-chart-card">
              <div className="panel-header">
                <PieChartIcon size={18} />
                <h3>Theme Distribution</h3>
              </div>
              <div className="sd-donut-layout">
                <div className="sd-donut-svg-wrap">
                  <svg viewBox="0 0 200 200" className="sd-donut-svg">
                    {donutSlices.map((s) => (
                      <path
                        key={s.key}
                        d={s.path}
                        fill={s.colorVar}
                        className={`sd-donut-slice ${hoveredSlice === s.key ? 'is-hovered' : ''}`}
                        tabIndex={0}
                        onMouseEnter={() => setHoveredSlice(s.key)}
                        onMouseLeave={() => setHoveredSlice(null)}
                        onFocus={() => setHoveredSlice(s.key)}
                        onBlur={() => setHoveredSlice(null)}
                      />
                    ))}
                    <text x="100" y="95" textAnchor="middle" className="sd-donut-center-value">
                      {formatCompact(donutTotal)}
                    </text>
                    <text x="100" y="113" textAnchor="middle" className="sd-donut-center-label">
                      {donutTotal === 1 ? 'challenge' : 'challenges'}
                    </text>
                  </svg>
                  {hoveredSlice && (() => {
                    const s = donutSlices.find((sl) => sl.key === hoveredSlice);
                    if (!s) return null;
                    return (
                      <div
                        className="sd-tooltip sd-donut-tooltip"
                        style={{ left: `${(s.labelPos.x / 200) * 100}%`, top: `${(s.labelPos.y / 200) * 100}%` }}
                      >
                        <strong>{s.count.toLocaleString()}</strong>
                        <span>{s.name}</span>
                      </div>
                    );
                  })()}
                </div>
                <ul className="sd-legend">
                  {donutSlices.map((s) => (
                    <li key={s.key} className="sd-legend-item">
                      <span className="sd-legend-swatch" style={{ background: s.colorVar }} />
                      <span className="sd-legend-name">{s.name}</span>
                      <span className="sd-legend-value">{s.count.toLocaleString()} · {s.pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="glass-panel sd-chart-card">
              <div className="panel-header">
                <Gauge size={18} />
                <h3>Approved vs Draft</h3>
              </div>
              <div className="sd-meter-wrap">
                <div className="sd-meter-track">
                  <div className="sd-meter-fill" style={{ width: `${stats.approvedPct}%` }} />
                </div>
                <div className="sd-meter-caption">
                  <span><strong>{stats.approvedPct}%</strong> Approved</span>
                  <span>{100 - stats.approvedPct}% Draft</span>
                </div>
              </div>
              <div className="sd-meter-breakdown">
                <div className="sd-meter-stat">
                  <span className="badge badge-approved">Approved</span>
                  <span className="sd-meter-stat-value">{stats.approvedCount.toLocaleString()}</span>
                </div>
                <div className="sd-meter-stat">
                  <span className="badge badge-draft">Draft</span>
                  <span className="sd-meter-stat-value">{stats.draftCount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top 5 Districts per Approved Theme Grid */}
          <div className="glass-panel sd-chart-card">
            <div className="panel-header">
              <MapPin size={18} />
              <h3>Top 5 Districts for Approved Themes</h3>
            </div>
            <div className="sd-approved-themes-dist-grid">
              {stats.topThemes.map((theme) => (
                <div key={theme.idx} className="sd-theme-dist-card">
                  <div className="sd-theme-card-header">
                    <span className="sd-theme-card-title">{theme.name}</span>
                    <span className="badge badge-approved">{theme.count.toLocaleString()} challenges</span>
                  </div>
                  <div className="sd-theme-card-districts">
                    {theme.top5Districts && theme.top5Districts.length > 0 ? (
                      theme.top5Districts.map((d, dIdx) => (
                        <div key={dIdx} className="sd-dist-rank-row">
                          <span className="sd-dist-rank-num">#{dIdx + 1}</span>
                          <span className="sd-dist-rank-name">{d.districtName} <small>({d.stateName})</small></span>
                          <span className="sd-dist-rank-count">{d.count.toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <span className="no-results">No district data</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Districts Bar Chart */}
          <div className="glass-panel sd-chart-card">
            <div className="panel-header">
              <BarChart3 size={18} />
              <h3>Top Districts by Challenge Count</h3>
            </div>
            <div className="sd-bar-chart">
              {stats.districtRanked.map((d) => (
                <div key={d.idx} className="sd-bar-row" tabIndex={0}>
                  <span className="sd-bar-label">{d.name} <span className="sd-bar-sublabel">({d.state})</span></span>
                  <div className="sd-bar-track">
                    <div
                      className="sd-bar-fill"
                      style={{ width: maxDistrictCount ? `${(d.count / maxDistrictCount) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="sd-bar-value">{d.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Trend */}
          <div className="glass-panel sd-chart-card">
            <div className="panel-header">
              <TrendingUp size={18} />
              <h3>Monthly Discussion Volume</h3>
              <span className="timestamp">{TREND_START} → present</span>
            </div>
            {stats.trendMonths.length === 0 ? (
              <p className="no-results">No dated records in this window for the current filters.</p>
            ) : (
              <>
                <div className="sd-trend-chart">
                  {stats.trendMonths.map((m) => (
                    <div key={m.month} className="sd-trend-bar-col" tabIndex={0}>
                      <div className="sd-trend-bar-track">
                        <div
                          className="sd-trend-bar"
                          style={{ height: maxTrendCount ? `${(m.count / maxTrendCount) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="sd-trend-month">{m.month.slice(2)}</span>
                      <div className="sd-tooltip sd-trend-tooltip">
                        <strong>{m.count.toLocaleString()}</strong>
                        <span>{m.month}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {stats.excludedFromTrend > 0 && (
                  <p className="sd-trend-caption">
                    {stats.excludedFromTrend.toLocaleString()} record(s) with missing or pre-{TREND_START} dates
                    (likely data-entry outliers) are excluded from this chart, but counted in all other metrics.
                  </p>
                )}
                <details className="sd-trend-details">
                  <summary>View monthly data table</summary>
                  <table className="themes-table sd-trend-table">
                    <thead>
                      <tr><th>Month</th><th>Challenges</th></tr>
                    </thead>
                    <tbody>
                      {stats.trendMonths.map((m) => (
                        <tr key={m.month}><td>{m.month}</td><td>{m.count.toLocaleString()}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </div>

          {/* Districts x Theme Table */}
          <div className="glass-panel sd-chart-card">
            <div className="panel-header">
              <TableIcon size={18} />
              <h3>Districts by Theme</h3>
            </div>
            <div className="themes-list-wrapper sd-table-wrapper">
              <table className="themes-table">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>State</th>
                    <th
                      className="sd-sortable-th"
                      onClick={() => setTableSortAsc((v) => !v)}
                    >
                      Total Challenges {tableSortAsc ? '▲' : '▼'}
                    </th>
                    <th>Distinct Themes</th>
                    <th>Top Theme</th>
                    <th>Approved %</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.districtDetails.map((row) => (
                    <tr key={row.districtIdx}>
                      <td>{row.district}</td>
                      <td>{row.state}</td>
                      <td>{row.total.toLocaleString()}</td>
                      <td>{row.distinctThemes}</td>
                      <td>
                        <div className="theme-table-cell">
                          <span className="theme-cell-title">{row.topThemeName}</span>
                          <span className="theme-cell-desc">
                            {row.topThemeCount.toLocaleString()} {row.topThemeCount === 1 ? 'challenge' : 'challenges'}
                          </span>
                        </div>
                      </td>
                      <td>{row.approvedPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .smart-dashboard-container {
          display: flex;
          flex-direction: column;
          gap: 2rem;

          /* Categorical series (dataviz skill default palette, dark-mode steps
             since the app defaults to dark; light overrides below) */
          --series-1: #3987e5;
          --series-2: #d95926;
          --series-3: #199e70;
          --series-4: #c98500;
          --series-5: #d55181;
          --series-6: #9085e9;
          --series-7: #06b6d4;
          --series-8: #f97316;
          --series-9: #a855f7;
          --series-other: var(--text-muted);
        }

        [data-theme='light'] .smart-dashboard-container {
          --series-1: #2a78d6;
          --series-2: #eb6834;
          --series-3: #1baf7a;
          --series-4: #eda100;
          --series-5: #e87ba4;
          --series-6: #4a3aa7;
          --series-7: #0284c7;
          --series-8: #ea580c;
          --series-9: #9333ea;
        }

        .sd-approved-themes-dist-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.25rem;
          margin-top: 1rem;
        }

        .sd-theme-dist-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.2rem;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .sd-theme-dist-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .sd-theme-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.8rem;
        }

        .sd-theme-card-title {
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--text-primary);
          line-height: 1.3;
        }

        .sd-theme-card-districts {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .sd-dist-rank-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.4rem 0.6rem;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 6px;
          font-size: 0.85rem;
        }

        .sd-dist-rank-num {
          font-weight: 700;
          font-size: 0.75rem;
          color: var(--color-primary);
          min-width: 24px;
        }

        .sd-dist-rank-name {
          flex: 1;
          color: var(--text-secondary);
        }

        .sd-dist-rank-name small {
          color: var(--text-muted);
        }

        .sd-dist-rank-count {
          font-weight: 600;
          color: var(--text-primary);
        }

        .viz-header h1 { color: var(--text-primary); }

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

        .sd-filter-panel {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 1.5rem;
        }

        .sd-filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .sd-filter-group-wide {
          flex: 1;
          min-width: 320px;
        }

        .sd-filter-group label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .sd-select, .sd-range-inputs input {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          padding: 0.6rem 0.9rem;
          border-radius: 10px;
          font-size: 0.875rem;
          font-family: var(--font-sans);
          outline: none;
          transition: all var(--transition-speed);
        }

        .sd-select option {
          background-color: #0d142b;
          color: #f8fafc;
        }

        [data-theme='light'] .sd-select option {
          background-color: #ffffff;
          color: #0f172a;
        }

        .sd-select:focus, .sd-range-inputs input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.15);
        }

        .sd-date-controls {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .sd-mode-tabs { flex-shrink: 0; }

        .sd-range-inputs {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          color: var(--text-secondary);
          font-size: 0.85rem;
        }

        .sd-reset-btn {
          margin-left: auto;
          height: fit-content;
        }

        .sd-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 3rem;
          color: var(--text-muted);
          text-align: center;
        }

        .sd-charts-grid {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 2rem;
        }

        @media (max-width: 992px) {
          .sd-charts-grid { grid-template-columns: 1fr; }
        }

        .sd-chart-card {
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
          margin: 0;
        }

        .panel-header .timestamp {
          margin-left: auto;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .no-results {
          color: var(--text-muted);
          text-align: center;
          margin-top: 1.5rem;
          font-size: 0.95rem;
        }

        .themes-list-wrapper {
          overflow-y: auto;
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

        .themes-table td {
          padding: 0.6rem 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .themes-table tbody tr {
          transition: background-color var(--transition-speed);
        }

        .themes-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .theme-table-cell {
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

        .sd-donut-layout {
          display: flex;
          align-items: center;
          gap: 2rem;
          flex-wrap: wrap;
        }

        .sd-donut-svg-wrap {
          position: relative;
          width: 200px;
          height: 200px;
          flex-shrink: 0;
        }

        .sd-donut-svg { width: 100%; height: 100%; overflow: visible; }

        .sd-donut-slice {
          stroke: var(--bg-card);
          stroke-width: 2;
          cursor: pointer;
          transition: opacity var(--transition-speed), filter var(--transition-speed);
          outline: none;
        }

        .sd-donut-slice.is-hovered {
          filter: brightness(1.12);
        }

        .sd-donut-center-value {
          font-family: var(--font-display);
          font-size: 1.6rem;
          font-weight: 700;
          fill: var(--text-primary);
        }

        .sd-donut-center-label {
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          fill: var(--text-muted);
        }

        .sd-tooltip {
          position: absolute;
          transform: translate(-50%, -120%);
          background: var(--bg-app);
          border: 1px solid var(--border-color);
          box-shadow: var(--shadow-premium);
          border-radius: 8px;
          padding: 0.4rem 0.7rem;
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          font-size: 0.75rem;
          white-space: nowrap;
          pointer-events: none;
          z-index: 20;
        }

        .sd-tooltip strong {
          color: var(--text-primary);
          font-size: 0.9rem;
        }

        .sd-tooltip span {
          color: var(--text-secondary);
        }

        .sd-legend {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          flex: 1;
          min-width: 220px;
        }

        .sd-legend-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.85rem;
        }

        .sd-legend-swatch {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .sd-legend-name {
          color: var(--text-primary);
          flex: 1;
        }

        .sd-legend-value {
          color: var(--text-muted);
          font-size: 0.75rem;
          white-space: nowrap;
        }

        .sd-meter-wrap {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .sd-meter-track {
          height: 16px;
          border-radius: 8px;
          background: var(--color-success-bg);
          overflow: hidden;
        }

        .sd-meter-fill {
          height: 100%;
          border-radius: 8px;
          background: var(--color-success);
          transition: width var(--transition-speed);
        }

        .sd-meter-caption {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .sd-meter-caption strong { color: var(--text-primary); font-size: 1rem; }

        .sd-meter-breakdown {
          display: flex;
          gap: 1.5rem;
          margin-top: 0.5rem;
        }

        .sd-meter-stat {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .sd-meter-stat-value {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .sd-bar-chart {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .sd-bar-row {
          display: grid;
          grid-template-columns: 180px 1fr 70px;
          align-items: center;
          gap: 1rem;
          outline: none;
        }

        .sd-bar-label {
          font-size: 0.85rem;
          color: var(--text-primary);
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sd-bar-sublabel {
          color: var(--text-muted);
          font-weight: 400;
        }

        .sd-bar-track {
          height: 18px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 9px;
          overflow: hidden;
        }

        .sd-bar-fill {
          height: 100%;
          border-radius: 9px;
          background: var(--series-1);
          transition: width var(--transition-speed);
        }

        .sd-bar-row:hover .sd-bar-fill, .sd-bar-row:focus .sd-bar-fill {
          filter: brightness(1.15);
        }

        .sd-bar-value {
          font-family: var(--font-display);
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-primary);
          text-align: right;
        }

        .sd-trend-chart {
          display: flex;
          align-items: flex-end;
          gap: 4px;
          height: 160px;
          padding-top: 1rem;
        }

        .sd-trend-bar-col {
          position: relative;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          height: 100%;
          outline: none;
        }

        .sd-trend-bar-track {
          flex: 1;
          width: 100%;
          display: flex;
          align-items: flex-end;
        }

        .sd-trend-bar {
          width: 100%;
          min-height: 2px;
          background: var(--series-1);
          border-radius: 4px 4px 0 0;
          transition: height var(--transition-speed), filter var(--transition-speed);
        }

        .sd-trend-bar-col:hover .sd-trend-bar, .sd-trend-bar-col:focus .sd-trend-bar {
          filter: brightness(1.15);
        }

        .sd-trend-month {
          font-size: 0.6rem;
          color: var(--text-muted);
          margin-top: 0.4rem;
          writing-mode: vertical-rl;
          transform: rotate(180deg);
        }

        .sd-trend-tooltip {
          display: none;
          bottom: 100%;
          left: 50%;
          top: auto;
        }

        .sd-trend-bar-col:hover .sd-trend-tooltip,
        .sd-trend-bar-col:focus .sd-trend-tooltip {
          display: flex;
        }

        .sd-trend-caption {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-style: italic;
        }

        .sd-trend-details summary {
          cursor: pointer;
          font-size: 0.85rem;
          color: var(--color-primary);
          font-weight: 600;
        }

        .sd-trend-table { margin-top: 1rem; max-height: 300px; display: block; overflow-y: auto; }

        .sd-table-wrapper { max-height: 500px; }

        .sd-sortable-th {
          cursor: pointer;
          user-select: none;
        }

        .sd-sortable-th:hover { color: var(--text-primary); }
      `}} />
    </div>
  );
}
