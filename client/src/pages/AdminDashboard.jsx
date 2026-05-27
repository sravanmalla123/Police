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
  getSseStreamUrl,
  deleteReport
} from '../services/api.js';
const zones = ['West', 'East', 'Rural', 'Organizations', 'Office', 'Commissionerate', 'ID Section'];
const divisions = ['West', 'South', 'North', 'Central', 'Nandigama', 'Mylavaram', 'Organizations Incharge', 'Office Morning Duty', 'Administrative Officer', 'Computer Operator', 'NTR Police Commissionerate', 'CSB ID Section'];
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

const formatDayDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_) {
    return dateStr;
  }
};

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
  const tileLayerRef = useRef(null);

  // Mobile App PWA states
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobileTab, setMobileTab] = useState('radar'); // 'radar', 'logs', 'stats', 'more'
  const [mapContainerEl, setMapContainerEl] = useState(null);
  const [activeGroup, setActiveGroup] = useState('all');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
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
    if (!window.L || !mapContainerEl) return;
    if (mapContainerEl._leaflet_id) return;

    const map = window.L.map(mapContainerEl).setView([15.9129, 79.7400], 7); // Center of AP
    
    const initialTileUrl = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    const tileLayer = window.L.tileLayer(initialTileUrl, {
      attribution: '&copy; OpenStreetMap &copy; CartoDB'
    }).addTo(map);

    tileLayerRef.current = tileLayer;
    setMapInstance(map);
    hasFitBoundsRef.current = false;

    return () => {
      map.remove();
      setMapInstance(null);
    };
  }, [mapContainerEl]);

  useEffect(() => {
    if (tileLayerRef.current) {
      const newTileUrl = theme === 'light'
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      tileLayerRef.current.setUrl(newTileUrl);
    }
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

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this incident report?')) return;
    setLoading(true);
    try {
      await deleteReport(reportId);
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err) {
      setMessage('Unable to delete report.');
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      // 1. Group channel filter
      if (activeGroup !== 'all') {
        if (report.access_mode !== activeGroup) return false;
      }

      // 2. Folder status filter
      if (activeFolder === 'resolved') {
        return report.status === 'resolved';
      }
      if (activeFolder === 'active') {
        return report.status === 'pending' || report.status === 'in_review';
      }
      return true; // 'all' folder
    });
  }, [reports, activeFolder, activeGroup]);

  const renderRadarMap = () => (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>GPS Incident Radar</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Real-time emergency dispatch map
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="button-secondary"
            onClick={handleRecenter}
            style={{ padding: '6px 10px', fontSize: '0.7rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', height: 'fit-content' }}
          >
            Recenter
          </button>
        </div>
      </div>
      <div ref={setMapContainerEl} style={{ width: '100%', height: '320px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)', background: '#18181b', marginBottom: '20px' }}></div>
      
      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
        <h2>Broadcast Emergency Alert</h2>
        <form onSubmit={handleBroadcastBulletin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px' }}>
            <input 
              type="text" 
              value={bulletinMessage} 
              onChange={e => setBulletinMessage(e.target.value)} 
              placeholder="Enter warning message..." 
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'rgba(5,7,12,0.6)', color: '#ffffff', outline: 'none', fontSize: '0.85rem' }}
              required
            />
            <select 
              value={bulletinSeverity} 
              onChange={e => setBulletinSeverity(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', background: '#121624', color: '#ffffff', outline: 'none', fontSize: '0.85rem' }}
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
  );

  const renderLogsFilter = () => (
    <div className="card">
      <h2>Incident Logs ({filteredReports.length})</h2>
      
      <div className="tabs-row" style={{ marginBottom: '12px' }}>
        <button
          type="button"
          className={`tab-btn ${activeFolder === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFolder('all')}
        >
          All
        </button>
        <button
          type="button"
          className={`tab-btn ${activeFolder === 'active' ? 'active' : ''}`}
          onClick={() => setActiveFolder('active')}
        >
          Active
        </button>
        <button
          type="button"
          className={`tab-btn ${activeFolder === 'resolved' ? 'active' : ''}`}
          onClick={() => setActiveFolder('resolved')}
        >
          Resolved
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '16px', background: 'rgba(5, 7, 12, 0.5)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
        {['all', 'SB Control', 'SB Periscope', 'SB DSR'].map(group => (
          <button
            key={group}
            type="button"
            className={`tab-btn ${activeGroup === group ? 'active' : ''}`}
            onClick={() => setActiveGroup(group)}
            style={{ fontSize: '0.7rem', padding: '6px 4px', whiteSpace: 'nowrap' }}
          >
            {group === 'all' ? 'All Groups' : group.replace('SB ', '')}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '12px', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Area</label>
            <input name="area" value={filters.area} onChange={handleFilter} placeholder="Filter Area" style={{ padding: '6px 10px', fontSize: '0.8rem' }} />
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Station</label>
            <input name="station" value={filters.station} onChange={handleFilter} placeholder="Filter Station" style={{ padding: '6px 10px', fontSize: '0.8rem' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Priority</label>
            <select name="priority" value={filters.priority} onChange={handleFilter} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
              {priorities.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="form-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.75rem', marginBottom: '4px' }}>Sort By</label>
            <select name="sortBy" value={filters.sortBy} onChange={handleFilter} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
              {sortOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <button className="button-primary" onClick={applyFilters} disabled={loading} style={{ padding: '8px', fontSize: '0.8rem' }}>
          {loading ? 'Refreshing...' : 'Apply Filters'}
        </button>
      </div>

      <div className="report-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredReports.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No reports found.</p>}
        {filteredReports.map(report => (
          <div key={report.id} className="report-card" style={{ padding: '12px', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem' }}>{report.area}</h3>
              <span className={`priority-badge priority-${(report.priority || 'Medium').toLowerCase()}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{report.priority}</span>
            </div>
            
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Uploaded by: <strong style={{ color: 'var(--accent-gold)' }}>{report.officer_name} ({report.uploader_role || 'Staff'})</strong>
            </div>

            {report.incident_date && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Occurred: <strong>{formatDayDate(report.incident_date)}</strong>
              </div>
            )}
            
            <p style={{ fontSize: '0.8rem', margin: '6px 0', minHeight: '30px' }}>{report.description}</p>
            
            {report.remarks && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.03)', borderLeft: '2px solid var(--accent-gold)', padding: '6px 10px', borderRadius: '4px', margin: '6px 0' }}>
                <strong>Remarks:</strong> {report.remarks}
              </div>
            )}

            {report.latitude && report.longitude && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', marginBottom: '6px' }}>
                GPS: {Number(report.latitude).toFixed(4)}, {Number(report.longitude).toFixed(4)}
              </div>
            )}

            {(report.incident_photo || report.place_photo) && (
              <div className="report-images-row" style={{ display: 'flex', gap: '8px', margin: '8px 0' }}>
                {report.incident_photo && (
                  <div className="report-image-thumb" style={{ width: '60px', height: '45px' }} onClick={() => setLightbox({ src: report.incident_photo, title: `Incident Photo - ${report.area}` })}>
                    <img src={report.incident_photo} alt="Incident" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                  </div>
                )}
                {report.place_photo && (
                  <div className="report-image-thumb" style={{ width: '60px', height: '45px' }} onClick={() => setLightbox({ src: report.place_photo, title: `Place Photo - ${report.area}` })}>
                    <img src={report.place_photo} alt="Place" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                  </div>
                )}
              </div>
            )}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Status:</span>
                <select
                  value={report.status}
                  onChange={(e) => handleStatusUpdate(report.id, e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: '#121624', color: '#fff' }}
                >
                  <option value="pending">PENDING</option>
                  <option value="in_review">IN REVIEW</option>
                  <option value="resolved">RESOLVED</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Assign Officer:</span>
                <select
                  value={report.assigned_officer || ''}
                  onChange={(e) => handleAssignOfficer(report.id, e.target.value)}
                  style={{ padding: '4px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-light)', background: '#121624', color: '#fff', maxWidth: '160px' }}
                >
                  <option value="">Unassigned</option>
                  {officers.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleDeleteReport(report.id)}
                  style={{ padding: '4px 10px', fontSize: '0.72rem', borderRadius: '4px', height: 'auto', borderColor: 'rgba(239,68,68,0.4)', color: 'var(--danger-red)' }}
                >
                  Delete Report
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSOCAnalytics = () => (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2>SOC Real-time Analytics</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div className="stat-card" style={{ padding: '12px' }}>
          <div>
            <h3 style={{ fontSize: '0.75rem' }}>Total Reports</h3>
            <strong style={{ fontSize: '1.2rem' }}>{analytics.total}</strong>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '12px' }}>
          <div>
            <h3 style={{ fontSize: '0.75rem' }}>High Priority</h3>
            <strong style={{ fontSize: '1.2rem', color: 'var(--danger-red)' }}>{analytics.high}</strong>
          </div>
        </div>
      </div>
      <div className="stat-card" style={{ padding: '12px' }}>
        <div>
          <h3 style={{ fontSize: '0.75rem' }}>Active Cases</h3>
          <strong style={{ fontSize: '1.2rem', color: 'var(--accent-gold)' }}>
            {reports.filter(r => r.status !== 'resolved').length}
          </strong>
        </div>
      </div>

      <div style={{ marginTop: '8px' }}>
        <h3>Area Distribution</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
          {Object.entries(analytics.areas).map(([area, count]) => {
            const percentage = analytics.total > 0 ? Math.round((count / analytics.total) * 100) : 0;
            return (
              <div key={area}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '2px' }}>
                  <span>{area}</span>
                  <strong>{count} ({percentage}%)</strong>
                </div>
                <div className="progress-bar-bg" style={{ height: '6px' }}>
                  <div className="progress-bar-fill" style={{ width: `${percentage}%` }}></div>
                </div>
              </div>
            );
          })}
          {Object.keys(analytics.areas).length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data recorded.</p>}
        </div>
      </div>

      <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
        <h3>Active Officers</h3>
        <div className="officers-grid" style={{ marginTop: '8px', gap: '6px' }}>
          {[...analytics.activeOfficers].map(officer => (
            <div key={officer} className="officer-badge" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
              <div className="officer-status-dot"></div>
              <span>{officer}</span>
            </div>
          ))}
          {analytics.activeOfficers.size === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No active officers.</p>}
        </div>
      </div>
    </div>
  );

  const renderMoreSettings = () => (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2>Account & Operations Settings</h2>
      
      <div style={{ display: 'grid', gap: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <div><strong>Administrator:</strong> <span style={{ color: '#fff' }}>{auth?.user?.name}</span></div>
        <div><strong>Role Level:</strong> <span style={{ color: 'var(--danger-red)' }}>{auth?.user?.role}</span></div>
        <div><strong>Center ID:</strong> <span><code>AP-HQ-COMMISSIONER</code></span></div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button className="button-secondary" onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', fontSize: '0.85rem' }}>
          Theme: <strong>{theme === 'light' ? 'Light' : 'Dark'}</strong>
        </button>

        <button
          onClick={() => navigate('/admin/incidents')}
          className="button-primary"
          style={{ padding: '12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          Open Incident Logs Portal
        </button>

        <button
          onClick={() => navigate('/admin/staff')}
          className="button-primary"
          style={{ padding: '12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          Manage Staff Logins
        </button>

        <button
          className="button-primary"
          onClick={onLogout}
          style={{ padding: '12px', background: 'var(--danger-red)', borderColor: 'var(--danger-red)', color: '#ffffff', fontSize: '0.85rem', marginTop: '10px' }}
        >
          Logout Secure Session
        </button>
      </div>
    </div>
  );

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
      
      {isMobile ? (
        /* Mobile Layout */
        <>
          <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 999 }}>
            <div className="brand-row" style={{ alignItems: 'center', gap: '8px' }}>
              <img 
                src="/ap_police_logo.png" 
                alt="AP Police Logo" 
                style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'contain' }} 
              />
              <div className="brand-copy">
                <h1 style={{ fontSize: '1rem' }}>Commissioner Portal</h1>
                <p style={{ fontSize: '0.65rem' }}>AP Command Center</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-red)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.2)', fontWeight: 'bold' }}>HQ LIVE</span>
            </div>
          </div>

          <div className="page-body" style={{ padding: '16px' }}>
            {bulletins.length > 0 && mobileTab !== 'radar' && (
              <div className={`bulletin-ticker-wrap ${bulletins[0].severity.toLowerCase()}-alert`} style={{ marginBottom: '12px' }}>
                <span className={`ticker-label ${bulletins[0].severity.toLowerCase()}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                  {bulletins[0].severity}
                </span>
                <div className="ticker-content" style={{ fontSize: '0.8rem' }}>
                  <strong>{bulletins[0].message}</strong>
                </div>
              </div>
            )}

            {message && <div className="alert">{message}</div>}

            {mobileTab === 'radar' && renderRadarMap()}
            {mobileTab === 'logs' && renderLogsFilter()}
            {mobileTab === 'stats' && renderSOCAnalytics()}
            {mobileTab === 'more' && renderMoreSettings()}
          </div>

          <div className="mobile-nav">
            <button className={`mobile-nav-item ${mobileTab === 'radar' ? 'active' : ''}`} onClick={() => setMobileTab('radar')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2 2a2.8 2.8 0 0 0-4 4l-2 2"/></svg>
              Radar
            </button>
            <button className={`mobile-nav-item ${mobileTab === 'logs' ? 'active' : ''}`} onClick={() => setMobileTab('logs')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Logs ({reports.filter(r => r.status !== 'resolved').length})
            </button>
            <button className={`mobile-nav-item ${mobileTab === 'stats' ? 'active' : ''}`} onClick={() => setMobileTab('stats')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Stats
            </button>
            <button className={`mobile-nav-item ${mobileTab === 'more' ? 'active' : ''}`} onClick={() => setMobileTab('more')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              More
            </button>
          </div>
        </>
      ) : (
        /* Desktop Layout */
        <>
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
              <div ref={setMapContainerEl} style={{ width: '100%', height: '380px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)', background: '#18181b' }}></div>
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

              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
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
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
