import { useEffect, useMemo, useState } from 'react';
import { fetchMyReports, submitReport, setAuthToken, fetchBulletins } from '../services/api.js';

function StaffDashboard({ auth, onLogout, theme, toggleTheme }) {
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({ area: '', station: '', officerName: auth?.user?.name || '', priority: 'High', description: '', latitude: '', longitude: '' });
  const languages = [
    { code: 'original', label: 'Original' },
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'Hindi' },
    { code: 'te', label: 'Telugu' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' }
  ];
  const [lang, setLang] = useState('original');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState('active'); // 'active' or 'resolved'
  const [mapInstance, setMapInstance] = useState(null);
  const [mapMarker, setMapMarker] = useState(null);
  const [bulletins, setBulletins] = useState([]);

  useEffect(() => {
    if (!window.L) return;
    const container = document.getElementById('staff-map');
    if (!container) return;

    const map = window.L.map('staff-map').setView([15.9129, 79.7400], 7); // Center of AP
    
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

    const handleMapClick = (e) => {
      const { lat, lng } = e.latlng;
      setForm(prev => ({
        ...prev,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6)
      }));
    };

    mapInstance.on('click', handleMapClick);

    return () => {
      mapInstance.off('click', handleMapClick);
    };
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance || !window.L) return;

    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      if (mapMarker) {
        mapMarker.setLatLng([lat, lng]);
      } else {
        const marker = window.L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: '#fbbf24',
          color: '#ffffff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(mapInstance);
        setMapMarker(marker);
      }
      mapInstance.setView([lat, lng], 10);
    } else {
      if (mapMarker) {
        mapInstance.removeLayer(mapMarker);
        setMapMarker(null);
      }
    }
  }, [mapInstance, form.latitude, form.longitude]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await fetchMyReports(lang);
      setReports(data.reports);
    } catch (error) {
      setMessage('Unable to load reports.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = event => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleGPSCapture = () => {
    if (navigator.geolocation) {
      setMessage('Requesting GPS coordinates...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setForm(prev => ({
            ...prev,
            latitude: position.coords.latitude.toFixed(6),
            longitude: position.coords.longitude.toFixed(6)
          }));
          setMessage('GPS location captured successfully.');
        },
        (error) => {
          const mockLat = (16.5062 + (Math.random() - 0.5) * 0.05).toFixed(6);
          const mockLng = (80.6480 + (Math.random() - 0.5) * 0.05).toFixed(6);
          setForm(prev => ({
            ...prev,
            latitude: mockLat,
            longitude: mockLng
          }));
          setMessage('GPS permission denied. Loaded simulated patrol location.');
        }
      );
    } else {
      setMessage('Geolocation is not supported by this browser.');
    }
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await submitReport({ 
        ...form, 
        officerName: auth?.user?.name || 'Officer', 
        station: form.station || 'Central Station',
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null
      });
      setMessage('Report submitted successfully.');
      setForm(prev => ({ ...prev, area: '', station: '', description: '', latitude: '', longitude: '' }));
      await loadReports();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to submit report.');
    } finally {
      setLoading(false);
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
    if (auth?.token) {
      setAuthToken(auth.token);
    }
    loadReports();
    loadBulletins();

    let es;
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      es = new EventSource(`${apiBase}/reports/stream?token=${auth?.token || ''}`);
      
      es.addEventListener('new_bulletin', e => {
        try {
          const b = JSON.parse(e.data);
          setBulletins(prev => [b, ...prev]);
        } catch (err) {
          // ignore
        }
      });

      es.addEventListener('report_updated', e => {
        loadReports();
      });
    } catch (err) {
      // ignore
    }

    return () => {
      if (es) es.close();
    };
  }, [lang]);

  const statusCount = useMemo(() => {
    const counts = { pending: 0, in_review: 0, resolved: 0 };
    reports.forEach(report => {
      if (counts[report.status] !== undefined) {
        counts[report.status] += 1;
      }
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
            <h1>Officer Command Center</h1>
            <p>Andhra Pradesh State Police Department</p>
          </div>
        </div>
        <div className="top-bar">
          <div className="top-bar-user">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Rank: <strong>{auth?.user?.role}</strong> | {auth?.user?.name}</span>
          </div>
          <div>
            <select id="lang-select" name="lang" value={lang} onChange={e => setLang(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-dark)', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem' }}>
              {languages.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
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
              <strong>{reports.length}</strong>
            </div>
            <div className="stat-icon-wrapper">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <h3>Active Cases</h3>
              <strong>{statusCount.pending + statusCount.in_review}</strong>
            </div>
            <div className="stat-icon-wrapper" style={{ color: 'var(--accent-gold)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <h3>Resolved</h3>
              <strong>{statusCount.resolved}</strong>
            </div>
            <div className="stat-icon-wrapper" style={{ color: 'var(--success-green)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <h2>File Incident Report</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-field">
                <label htmlFor="area">Area / Sector Name</label>
                <input id="area" name="area" value={form.area} onChange={handleChange} placeholder="e.g. North Zone, Sector 4" required />
              </div>
              <div className="form-field">
                <label htmlFor="station">Reporting Station</label>
                <input id="station" name="station" value={form.station} onChange={handleChange} placeholder="e.g. Central Station" required />
              </div>
              <div className="form-field">
                <label htmlFor="priority">Incident Priority</label>
                <select id="priority" name="priority" value={form.priority} onChange={handleChange}>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
              <div className="form-field">
                <label>GPS Coordinates (or click map to pin location)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
                  <input 
                    type="text" 
                    name="latitude" 
                    value={form.latitude} 
                    onChange={handleChange} 
                    placeholder="Latitude" 
                  />
                  <input 
                    type="text" 
                    name="longitude" 
                    value={form.longitude} 
                    onChange={handleChange} 
                    placeholder="Longitude" 
                  />
                  <button 
                    type="button" 
                    className="button-secondary" 
                    onClick={handleGPSCapture} 
                    style={{ padding: '0 12px', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                    GPS
                  </button>
                </div>
                <div style={{ width: '100%', height: '160px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)', background: '#121316' }} id="staff-map"></div>
              </div>
              <div className="form-field">
                <label htmlFor="description">Incident Description</label>
                <textarea id="description" name="description" value={form.description} onChange={handleChange} placeholder="Detail the event situation, location and required action..." required />
              </div>
              <button className="button-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Submitting…' : 'Submit Incident Report'}
              </button>
            </form>
          </div>

          <div className="card">
            <div style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)', marginBottom: '16px' }}>
              <img 
                src="/ap_police_dashboard.png" 
                alt="HQ Command Control" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to top, rgba(18,18,20,0.95), rgba(18,18,20,0.2))' }} />
              <div style={{ position: 'absolute', bottom: '12px', left: '12px' }}>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--primary)', fontWeight: 'bold' }}>HQ Feed</span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '1rem', color: '#ffffff' }}>Andhra Pradesh Command Operations</h3>
              </div>
            </div>

            <h2>Incident Logs</h2>
            
            <div className="tabs-row" style={{ marginBottom: '16px' }}>
              <button
                type="button"
                className={`tab-btn ${activeFolder === 'active' ? 'active' : ''}`}
                onClick={() => setActiveFolder('active')}
              >
                Active Folder ({statusCount.pending + statusCount.in_review})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeFolder === 'resolved' ? 'active' : ''}`}
                onClick={() => setActiveFolder('resolved')}
              >
                Resolved Folder ({statusCount.resolved})
              </button>
            </div>

            <div className="report-grid">
              {filteredReports.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No reports in this folder.</p>}
              {filteredReports.map(report => (
                <div key={report.id} className="report-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0 }}>{report.area}</h3>
                    <span className={`priority-badge priority-${(report.priority || 'Medium').toLowerCase()}`}>{report.priority}</span>
                  </div>
                  <p style={{ minHeight: '40px' }}>{lang !== 'original' ? (report.translations?.[lang] || report.description) : report.description}</p>
                  
                  {report.latitude && report.longitude && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                      <span>Location GPS: <strong>{Number(report.latitude).toFixed(4)}, {Number(report.longitude).toFixed(4)}</strong></span>
                    </div>
                  )}

                  {/* Assigned Officer Display */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '10px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span>Assigned Dispatch: <strong style={{ color: report.assigned_officer ? '#60a5fa' : 'var(--text-muted)' }}>{report.assigned_officer || 'Pending Assignment'}</strong></span>
                  </div>

                  <div className="report-card-meta">
                    <span className="report-card-date" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {new Date(report.created_at).toLocaleString()}
                    </span>
                    <span className={`status-pill status-${report.status.replace('_', '-')}`}>{report.status.replace('_', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StaffDashboard;
