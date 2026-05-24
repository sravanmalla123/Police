import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  fetchAdminReports, 
  setAuthToken, 
  updateReportStatus, 
  fetchOfficers, 
  assignOfficerToReport, 
  fetchBulletins, 
  broadcastBulletin,
  getSseStreamUrl
} from '../services/api.js';
const zones = ['West', 'East', 'Rural'];
const divisions = ['West', 'South', 'North', 'Central', 'Nandigama', 'Mylavaram'];
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
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [bulletins, setBulletins] = useState([]);
  
  const [filters, setFilters] = useState({ area: '', station: '', priority: 'All', status: 'All', sortBy: 'Newest', lang: 'original' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState('active'); // 'active' or 'resolved'
  const [mapInstance, setMapInstance] = useState(null);

  const hasFitBoundsRef = useRef(false);
  const [lightbox, setLightbox] = useState(null);

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
      const sseUrl = getSseStreamUrl(auth?.token || '');
      es = new EventSource(sseUrl);
      
      es.onerror = (err) => {
        try {
          const authData = localStorage.getItem('police-portal-auth');
          if (authData) {
            const parsed = JSON.parse(authData);
            const token = parsed?.token;
            if (token) {
              const payloadB64 = token.split('.')[1];
              const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
              if (payload.exp && payload.exp * 1000 < Date.now()) {
                es.close();
                console.log('SSE connection closed because the token expired.');
              }
            }
          } else {
            es.close();
          }
        } catch (_) {}
      };

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
        try {
          const updated = JSON.parse(e.data);
          setReports(prev => prev.map(r => {
            if (r.id === updated.id) {
              return {
                ...r,
                status: updated.status,
                assigned_officer: updated.assigned_officer,
                updated_at: updated.updated_at
              };
            }
            return r;
          }));
        } catch (err) {
          // ignore
        }
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
    hasFitBoundsRef.current = false;

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

        let photosHtml = '';
        if (report.incident_photo || report.place_photo) {
          photosHtml = `
            <div style="display: flex; gap: 6px; margin: 8px 0;">
              ${report.incident_photo ? `
                <div style="position: relative; width: 45px; height: 35px; border-radius: 4px; overflow: hidden; border: 1px solid #ddd;">
                  <img src="${report.incident_photo}" style="width: 100%; height: 100%; object-fit: cover;" />
                </div>` : ''}
              ${report.place_photo ? `
                <div style="position: relative; width: 45px; height: 35px; border-radius: 4px; overflow: hidden; border: 1px solid #ddd;">
                  <img src="${report.place_photo}" style="width: 100%; height: 100%; object-fit: cover;" />
                </div>` : ''}
            </div>
          `;
        }

        const popupContent = `
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; color: #0a1224; min-width: 180px; padding: 4px;">
            <h4 style="margin: 0 0 6px 0; font-size: 0.95rem; font-weight: 700; color: #0a1224;">${report.area}</h4>
            <div style="font-size: 0.8rem; margin-bottom: 4px; color: #555;"><strong>Officer:</strong> ${report.officer_name}</div>
            <div style="font-size: 0.8rem; margin-bottom: 4px; color: #555;"><strong>Station:</strong> ${report.station}</div>
            <div style="font-size: 0.8rem; margin-bottom: 4px; color: #555;"><strong>Priority:</strong> <span style="font-weight: 600; color: ${markerColor};">${report.priority}</span></div>
            <div style="font-size: 0.8rem; margin-bottom: 4.5px; color: #555;"><strong>Assigned:</strong> <span style="font-weight: 600; color: #1e3a8a;">${report.assigned_officer || 'Unassigned'}</span></div>
            ${photosHtml}
            <div style="font-size: 0.8rem; line-height: 1.3; background: #f0f4f8; padding: 6px; border-radius: 6px; border-left: 3px solid ${markerColor}; color: #0a1224; margin-bottom: ${report.remarks ? '6px' : '0'};">${report.description}</div>
            ${report.remarks ? `<div style="font-size: 0.8rem; line-height: 1.3; background: #fffbeb; padding: 6px; border-radius: 6px; border-left: 3px solid #d97706; color: #b45309;"><strong>Remarks:</strong> ${report.remarks}</div>` : ''}
          </div>
        `;
        marker.bindPopup(popupContent);
        marker.addTo(mapInstance);
        markers.push(marker);
      }
    });

    if (markers.length > 0 && !hasFitBoundsRef.current) {
      const group = new window.L.featureGroup(markers);
      mapInstance.fitBounds(group.getBounds().pad(0.15));
      hasFitBoundsRef.current = true;
    }
  }, [mapInstance, reports]);

  const handleFilter = event => {
    const { name, value } = event.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    if (name === 'lang') {
      loadReports({ lang: value });
    }
  };

  const applyFilters = () => loadReports();

  const handleStatusUpdate = async (reportId, status) => {
    setLoading(true);
    try {
      const res = await updateReportStatus(reportId, status);
      if (res.success && res.report) {
        setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: res.report.status } : r));
      }
    } catch (err) {
      setMessage('Unable to update report status.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignOfficer = async (reportId, officerName) => {
    setLoading(true);
    try {
      const res = await assignOfficerToReport(reportId, officerName);
      if (res.success && res.report) {
        setReports(prev => prev.map(r => r.id === reportId ? { ...r, assigned_officer: res.report.assigned_officer } : r));
      }
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

  const handleRecenter = () => {
    if (!mapInstance || !window.L) return;
    const markers = [];
    mapInstance.eachLayer(layer => {
      if (layer instanceof window.L.CircleMarker) {
        markers.push(layer);
      }
    });
    if (markers.length > 0) {
      const group = new window.L.featureGroup(markers);
      mapInstance.fitBounds(group.getBounds().pad(0.15));
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
      if (activeFolder === 'active') {
        return report.status === 'pending' || report.status === 'in_review';
      }
      return true; // 'all' folder
    });
  }, [reports, activeFolder]);

  return (
    <div className="page-frame">
      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" onClick={() => setLightbox(null)}>&times;</button>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={lightbox.src} alt={lightbox.title} />
            <h3 className="lightbox-title">{lightbox.title}</h3>
          </div>
        </div>
      )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                className="button-secondary"
                onClick={handleRecenter}
                style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: 'fit-content' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Recenter Map
              </button>
              <span style={{ fontSize: '0.75rem', padding: '6px 10px', background: 'var(--success-green-glow)', color: 'var(--success-green)', borderRadius: '4px', fontWeight: 'bold', border: '1px solid rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', gap: '6px', height: 'fit-content' }}>
                <span className="live-dot" style={{ width: '6px', height: '6px', background: 'var(--success-green)', borderRadius: '50%', display: 'inline-block' }}></span>
                LIVE DISPATCH RADAR
              </span>
            </div>
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

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ margin: 0, border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                All Incident Log Entries
              </h2>
              <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Open the dedicated, full-screen portal to view, manage, filter, and assign officers to active or resolved dispatches.
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/incidents')}
              className="button-primary"
              style={{
                padding: '12px 28px',
                fontSize: '0.95rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                height: 'fit-content'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Open Incident Logs Portal
            </button>
          </div>
        </div>

        {/* Staff Login Accounts Management */}
        <div className="card" style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px', padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ margin: 0, border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                Staff Login Accounts Management
              </h2>
              <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Create, remove, and manage login credentials for Circle Inspectors (CI), Sub Inspectors (SI), Constables, and other staff members.
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/staff')}
              className="button-primary"
              style={{
                padding: '12px 28px',
                fontSize: '0.95rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                height: 'fit-content'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
              Manage Staff Logins
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
