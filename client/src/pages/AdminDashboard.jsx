import { useEffect, useMemo, useState } from 'react';
import { 
  fetchAdminReports, 
  setAuthToken, 
  updateReportStatus, 
  fetchOfficers, 
  assignOfficerToReport, 
  fetchBulletins, 
  broadcastBulletin 
} from '../services/api.js';

const priorities = ['All', 'High', 'Medium', 'Low'];
const statuses = ['All', 'pending', 'in_review', 'resolved'];
const sortOptions = ['Newest', 'Oldest', 'Priority'];
const languages = [
  { code: 'original', label: 'Original' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' }
];

function AdminDashboard({ auth, onLogout, theme, toggleTheme }) {
  const [reports, setReports] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [bulletins, setBulletins] = useState([]);
  
  const [filters, setFilters] = useState({ area: '', station: '', priority: 'All', status: 'All', sortBy: 'Newest', lang: 'original' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState('active'); // 'active' or 'resolved'
  const [mapInstance, setMapInstance] = useState(null);

  const [bulletinMessage, setBulletinMessage] = useState('');
  const [bulletinSeverity, setBulletinSeverity] = useState('Critical');
  const [bulletinLoading, setBulletinLoading] = useState(false);

  const loadReports = async (override) => {
    setLoading(true);
    setMessage('');
    try {
      const params = {
        area: override?.area ?? filters.area,
        station: override?.station ?? filters.station,
        priority: override?.priority ?? filters.priority,
        status: override?.status ?? filters.status,
        sortBy: override?.sortBy ?? filters.sortBy,
        lang: override?.lang ?? filters.lang
      };
      const data = await fetchAdminReports(params);
      setReports(data.reports);
      if (override) setFilters(prev => ({ ...prev, ...override }));
    } catch (err) {
      setMessage('Unable to load admin reports.');
    } finally {
      setLoading(false);
    }
  };

  const loadOfficers = async () => {
    try {
      const data = await fetchOfficers();
      setOfficers(data.officers || []);
    } catch (err) {
      // ignore
    }
  };

  const loadBulletins = async () => {
    try {
      const data = await fetchBulletins();
      setBulletins(data.bulletins || []);
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    if (auth?.token) setAuthToken(auth.token);
    loadReports();
    loadOfficers();
    loadBulletins();

    // open SSE connection for real-time synchronization
    let es;
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      es = new EventSource(`${apiBase}/reports/stream?token=${auth?.token || ''}`);
      
      es.addEventListener('new_report', e => {
        try {
          const r = JSON.parse(e.data);
          setReports(prev => {
            if (prev.some(x => x.id === r.id)) return prev;
            return [r, ...prev];
          });
        } catch (err) {
          // ignore
        }
      });

      es.addEventListener('report_updated', e => {
        loadReports();
      });

      es.addEventListener('new_bulletin', e => {
        try {
          const b = JSON.parse(e.data);
          setBulletins(prev => [b, ...prev]);
        } catch (err) {
          // ignore
        }
      });
    } catch (e) {
      // ignore
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  useEffect(() => {
    if (!window.L) return;
    const container = document.getElementById('map-radar');
    if (!container) return;

    if (mapInstance) {
      mapInstance.remove();
    }

    const map = window.L.map('map-radar').setView([15.9129, 79.7400], 7); // Center of AP
    
    const tileUrl = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    window.L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap &copy; CartoDB'
    }).addTo(map);

    setMapInstance(map);

    return () => {
      map.remove();
    };
  }, [theme]);

  useEffect(() => {
    if (!mapInstance || !window.L) return;

    // Clear existing markers
    mapInstance.eachLayer(layer => {
      if (layer instanceof window.L.CircleMarker) {
        mapInstance.removeLayer(layer);
      }
    });

    const markers = [];
    reports.forEach(report => {
      if (report.latitude && report.longitude) {
        const markerColor = report.priority === 'High' ? '#ff3b30' : report.priority === 'Medium' ? '#ffcc00' : '#34c759';
        const marker = window.L.circleMarker([report.latitude, report.longitude], {
          radius: 8,
          fillColor: markerColor,
          color: '#ffffff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.8
        });

        const popupContent = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; color: #0a1224; min-width: 180px; padding: 4px;">
            <h4 style="margin: 0 0 6px 0; font-size: 0.95rem; font-weight: 700; color: #0a1224;">${report.area}</h4>
            <div style="font-size: 0.8rem; margin-bottom: 4px; color: #555;"><strong>Officer:</strong> ${report.officer_name}</div>
            <div style="font-size: 0.8rem; margin-bottom: 4px; color: #555;"><strong>Station:</strong> ${report.station}</div>
            <div style="font-size: 0.8rem; margin-bottom: 4px; color: #555;"><strong>Priority:</strong> <span style="font-weight: 600; color: ${markerColor};">${report.priority}</span></div>
            <div style="font-size: 0.8rem; margin-bottom: 4.5px; color: #555;"><strong>Assigned:</strong> <span style="font-weight: 600; color: #1e3a8a;">${report.assigned_officer || 'Unassigned'}</span></div>
            <div style="font-size: 0.8rem; line-height: 1.3; background: #f0f4f8; padding: 6px; border-radius: 6px; border-left: 3px solid ${markerColor}; color: #0a1224;">${report.description}</div>
          </div>
        `;
        marker.bindPopup(popupContent);
        marker.addTo(mapInstance);
        markers.push(marker);
      }
    });

    if (markers.length > 0) {
      const group = new window.L.featureGroup(markers);
      mapInstance.fitBounds(group.getBounds().pad(0.15));
    }
  }, [mapInstance, reports]);

  const handleFilter = event => {
    const { name, value } = event.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const applyFilters = () => loadReports();

  const handleStatusUpdate = async (reportId, status) => {
    setLoading(true);
    try {
      await updateReportStatus(reportId, status);
      await loadReports();
    } catch (err) {
      setMessage('Unable to update report status.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignOfficer = async (reportId, officerName) => {
    setLoading(true);
    try {
      await assignOfficerToReport(reportId, officerName);
      await loadReports();
    } catch (err) {
      setMessage('Unable to assign officer.');
    } finally {
      setLoading(false);
    }
  };

  const handleBroadcastBulletin = async (e) => {
    e.preventDefault();
    if (!bulletinMessage.trim()) return;
    setBulletinLoading(true);
    setMessage('');
    try {
      await broadcastBulletin(bulletinMessage, bulletinSeverity);
      setBulletinMessage('');
      setMessage('Emergency bulletin broadcasted successfully.');
      loadBulletins();
    } catch (err) {
      setMessage('Unable to broadcast bulletin.');
    } finally {
      setBulletinLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const counts = { total: 0, high: 0, pending: 0, areas: {}, activeOfficers: new Set() };
    reports.forEach(report => {
      counts.total += 1;
      if (report.priority === 'High') counts.high += 1;
      if (report.status === 'pending') counts.pending += 1;
      counts.areas[report.area] = (counts.areas[report.area] || 0) + 1;
      counts.activeOfficers.add(report.officer_name);
    });
    return counts;
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      if (activeFolder === 'resolved') {
        return report.status === 'resolved';
      }
      return report.status === 'pending' || report.status === 'in_review';
    });
  }, [reports, activeFolder]);

  return (
    <div className="page-frame">
      <div className="page-header">
        <div className="brand-row" style={{ alignItems: 'center' }}>
          <img 
            src="/ap_police_logo.png" 
            alt="AP Police Logo" 
            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.15))' }} 
          />
          <div className="brand-copy">
            <h1>Commissioner Control Center</h1>
            <p>Andhra Pradesh State Police Department</p>
          </div>
        </div>
        <div className="top-bar">
          <div className="top-bar-user">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Dashboard: <strong>Commissioner</strong> | {auth?.user?.name}</span>
          </div>
          <button 
            className="theme-toggle-btn-small" 
            onClick={toggleTheme} 
            type="button"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {theme === 'light' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>
          <button className="button-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Real-time Emergency Alert Ticker */}
        {bulletins.length > 0 && (
          <div className={`bulletin-ticker-wrap ${bulletins[0].severity.toLowerCase()}-alert`}>
            <span className={`ticker-label ${bulletins[0].severity.toLowerCase()}`}>
              {bulletins[0].severity}
            </span>
            <div className="ticker-content">
              <strong>{bulletins[0].message}</strong>
              <span className="ticker-time">
                — {new Date(bulletins[0].created_at).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}

        {message && <div className="alert">{message}</div>}

        <div className="dashboard-grid">
          <div className="stat-card">
            <div>
              <h3>Total Reports</h3>
              <strong>{analytics.total}</strong>
            </div>
            <div className="stat-icon-wrapper">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <h3>High Priority</h3>
              <strong>{analytics.high}</strong>
            </div>
            <div className="stat-icon-wrapper" style={{ color: 'var(--danger-red)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <h3>Active Cases</h3>
              <strong>{reports.filter(r => r.status !== 'resolved').length}</strong>
            </div>
            <div className="stat-icon-wrapper" style={{ color: 'var(--accent-gold)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
          </div>
        </div>

        {/* Live GPS Radar Map */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>AP Command Center - GPS Incident Radar</h2>
              <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Real-time geographic plotting of emergency dispatches and live traffic incidents across Andhra Pradesh.
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', padding: '4px 10px', background: 'var(--success-green-glow)', color: 'var(--success-green)', borderRadius: '4px', fontWeight: 'bold', border: '1px solid rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="live-dot" style={{ width: '6px', height: '6px', background: 'var(--success-green)', borderRadius: '50%', display: 'inline-block' }}></span>
              LIVE DISPATCH RADAR
            </span>
          </div>
          <div id="map-radar" style={{ width: '100%', height: '380px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)', background: '#18181b' }}></div>
        </div>

        <div className="card">
          <h2>Filters & Search Parameters</h2>
          <div className="filter-row">
            <div className="form-field">
              <label htmlFor="area">Area / Zone</label>
              <input id="area" name="area" value={filters.area} onChange={handleFilter} placeholder="e.g. North Zone" />
            </div>
            <div className="form-field">
              <label htmlFor="station">Station</label>
              <input id="station" name="station" value={filters.station} onChange={handleFilter} placeholder="e.g. Central Station" />
            </div>
            <div className="form-field">
              <label htmlFor="priority">Priority</label>
              <select id="priority" name="priority" value={filters.priority} onChange={handleFilter}>
                {priorities.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" value={filters.status} onChange={handleFilter}>
                {statuses.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="sortBy">Sort By</label>
              <select id="sortBy" name="sortBy" value={filters.sortBy} onChange={handleFilter}>
                {sortOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="lang">Translate To</label>
              <select id="lang" name="lang" value={filters.lang} onChange={handleFilter}>
                {languages.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="button-primary" onClick={applyFilters} disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Refreshing SOC Data…' : 'Query & Update Report List'}
          </button>
        </div>

        <div className="grid-2">
          <div className="card">
            <h2>Area Distribution</h2>
            <div className="summary-block">
              {Object.entries(analytics.areas).map(([area, count]) => {
                const percentage = analytics.total > 0 ? Math.round((count / analytics.total) * 100) : 0;
                return (
                  <div key={area} className="summary-item-wrap">
                    <div className="summary-item">
                      <span>{area}</span>
                      <strong>{count} ({percentage}%)</strong>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${percentage}%` }}></div>
                    </div>
                  </div>
                );
              })}
              {Object.keys(analytics.areas).length === 0 && <p style={{ color: 'var(--text-muted)' }}>No incident data recorded yet.</p>}
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyBetween: 'space-between' }}>
            <div>
              <h2>Active Officers on Duty</h2>
              <div className="officers-grid" style={{ marginBottom: '24px' }}>
                {[...analytics.activeOfficers].map(officer => (
                  <div key={officer} className="officer-badge">
                    <div className="officer-status-dot"></div>
                    <span>{officer}</span>
                  </div>
                ))}
                {analytics.activeOfficers.size === 0 && <p style={{ color: 'var(--text-muted)' }}>No active officers submitting reports yet.</p>}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
              <h2>Broadcast Emergency Alert</h2>
              <form onSubmit={handleBroadcastBulletin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px' }}>
                  <input 
                    type="text" 
                    value={bulletinMessage} 
                    onChange={e => setBulletinMessage(e.target.value)} 
                    placeholder="Enter warning message..." 
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'rgba(5,7,12,0.6)', color: '#ffffff', outline: 'none' }}
                    required
                  />
                  <select 
                    value={bulletinSeverity} 
                    onChange={e => setBulletinSeverity(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: '#121624', color: '#ffffff', outline: 'none' }}
                  >
                    <option value="Critical">Critical</option>
                    <option value="Warning">Warning</option>
                    <option value="Info">Info</option>
                  </select>
                </div>
                <button className="button-primary" type="submit" disabled={bulletinLoading} style={{ width: '100%', padding: '10px' }}>
                  {bulletinLoading ? 'Broadcasting Alert…' : 'Publish State Bulletin'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>All Incident Log Entries</h2>
          
          <div className="tabs-row" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={`tab-btn ${activeFolder === 'active' ? 'active' : ''}`}
              onClick={() => setActiveFolder('active')}
            >
              Active Folder ({reports.filter(r => r.status !== 'resolved').length})
            </button>
            <button
              type="button"
              className={`tab-btn ${activeFolder === 'resolved' ? 'active' : ''}`}
              onClick={() => setActiveFolder('resolved')}
            >
              Resolved Folder ({reports.filter(r => r.status === 'resolved').length})
            </button>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Area / Station</th>
                  <th>Incident Message</th>
                  <th>Reporter</th>
                  <th>Assigned Officer</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map(report => (
                  <tr key={report.id}>
                    <td>
                      <strong style={{ color: '#ffffff' }}>{report.area}</strong>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>{report.station}</div>
                      {report.latitude && report.longitude && (
                        <div style={{ color: 'var(--accent-gold)', fontSize: '0.75rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                          <span>{Number(report.latitude).toFixed(4)}, {Number(report.longitude).toFixed(4)}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: '200px', maxWidth: '350px' }}>
                      {report.translated_description ? report.translated_description : report.description}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{report.officer_name}</span>
                    </td>
                    <td>
                      <select 
                        value={report.assigned_officer || ''} 
                        onChange={e => handleAssignOfficer(report.id, e.target.value)} 
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: '#18181b', color: '#ffffff', outline: 'none', fontSize: '0.85rem', width: '100%', maxWidth: '170px' }}
                      >
                        <option value="">Unassigned</option>
                        {officers.map(off => (
                          <option key={off.id} value={off.name}>
                            {off.name} ({off.role})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`priority-badge priority-${(report.priority || 'Medium').toLowerCase()}`}>{report.priority}</span>
                    </td>
                    <td>
                      <span className={`status-pill status-${report.status.replace('_', '-')}`}>{report.status.replace('_', ' ')}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(report.created_at).toLocaleString()}
                    </td>
                    <td>
                      <select defaultValue={report.status} onChange={e => handleStatusUpdate(report.id, e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: '#18181b', color: '#ffffff', outline: 'none', fontSize: '0.85rem' }}>
                        <option value="pending">Pending</option>
                        <option value="in_review">In Review</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No reports available in this folder.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
