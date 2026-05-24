import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  fetchAdminReports, 
  setAuthToken, 
  updateReportStatus, 
  fetchOfficers, 
  assignOfficerToReport, 
  getSseStreamUrl,
  deleteReport
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

const formatDayDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_) {
    return dateStr;
  }
};

function AllIncidentsPage({ auth, onLogout, theme, toggleTheme }) {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeFolder, setActiveFolder] = useState('all'); // 'all', 'active', 'resolved'
  const [activeGroup, setActiveGroup] = useState('all'); // 'all', 'SB Control', 'SB Periscope', 'SB DSR'
  const [lightbox, setLightbox] = useState(null);

  const [filters, setFilters] = useState({ 
    area: '', 
    station: '', 
    priority: 'All', 
    status: 'All', 
    sortBy: 'Newest', 
    lang: 'original' 
  });

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
      setMessage('Unable to load incident reports.');
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

  useEffect(() => {
    if (auth?.token) setAuthToken(auth.token);
    loadReports();
    loadOfficers();

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

      es.addEventListener('report_deleted', e => {
        try {
          const deleted = JSON.parse(e.data);
          setReports(prev => prev.filter(r => r.id !== deleted.id));
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
            <h1>All Incident Log Entries</h1>
            <p>Andhra Pradesh State Police Department</p>
          </div>
        </div>
        
        <div className="top-bar">
          <button 
            className="button-secondary" 
            onClick={() => navigate('/admin')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to Control Center
          </button>
          
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
        {message && <div className="alert">{message}</div>}

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

        <div className="card">
          <h2
            onClick={() => setActiveFolder('all')}
            style={{
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%'
            }}
            title="Click to view all entries"
            className="interactive-header"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              All Incident Log Entries
            </span>
            {activeFolder === 'all' && (
              <span className="priority-badge priority-low" style={{ fontSize: '0.75rem', textTransform: 'none', padding: '4px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-strong)' }}>
                Showing All
              </span>
            )}
          </h2>
          
          {/* Group Tabs Selection */}
          <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
              Select Intelligence Group Channel
            </label>
            <div className="tabs-row" style={{ margin: 0 }}>
              <button
                type="button"
                className={`tab-btn ${activeGroup === 'all' ? 'active' : ''}`}
                onClick={() => setActiveGroup('all')}
              >
                All Groups ({reports.length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeGroup === 'SB Control' ? 'active' : ''}`}
                onClick={() => setActiveGroup('SB Control')}
              >
                SB Control ({reports.filter(r => r.access_mode === 'SB Control').length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeGroup === 'SB Periscope' ? 'active' : ''}`}
                onClick={() => setActiveGroup('SB Periscope')}
              >
                SB Periscope ({reports.filter(r => r.access_mode === 'SB Periscope').length})
              </button>
              <button
                type="button"
                className={`tab-btn ${activeGroup === 'SB DSR' ? 'active' : ''}`}
                onClick={() => setActiveGroup('SB DSR')}
              >
                SB DSR ({reports.filter(r => r.access_mode === 'SB DSR').length})
              </button>
            </div>
          </div>

          {/* Status Tabs Selection */}
          <div className="tabs-row" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={`tab-btn ${activeFolder === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFolder('all')}
            >
              All Folder ({reports.filter(r => activeGroup === 'all' || r.access_mode === activeGroup).length})
            </button>
            <button
              type="button"
              className={`tab-btn ${activeFolder === 'active' ? 'active' : ''}`}
              onClick={() => setActiveFolder('active')}
            >
              Active Folder ({reports.filter(r => (activeGroup === 'all' || r.access_mode === activeGroup) && r.status !== 'resolved').length})
            </button>
            <button
              type="button"
              className={`tab-btn ${activeFolder === 'resolved' ? 'active' : ''}`}
              onClick={() => setActiveFolder('resolved')}
            >
              Resolved Folder ({reports.filter(r => (activeGroup === 'all' || r.access_mode === activeGroup) && r.status === 'resolved').length})
            </button>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Reporting Station</th>
                  <th>Incident Message</th>
                  <th>Uploaded Pictures</th>
                  <th>Remarks</th>
                  <th>Reporter Name / ID</th>
                  <th>Zone</th>
                  <th>Division</th>
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
                      <strong style={{ color: 'var(--text-primary)' }}>{report.area}</strong>
                      {report.latitude && report.longitude && (
                        <div style={{ color: 'var(--accent-gold)', fontSize: '0.75rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                          <span>{Number(report.latitude).toFixed(4)}, {Number(report.longitude).toFixed(4)}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{report.station}</span>
                    </td>
                    <td style={{ minWidth: '150px', maxWidth: '250px' }}>
                      {report.incident_date && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          <span>Occurred: <strong style={{ color: 'var(--accent-gold)' }}>{formatDayDate(report.incident_date)}</strong></span>
                        </div>
                      )}
                      <div>{report.translated_description ? report.translated_description : report.description}</div>
                    </td>
                    <td>
                      {(report.incident_photo || report.place_photo) ? (
                        <div className="report-images-row" style={{ margin: 0, justifyContent: 'flex-start' }}>
                          {report.incident_photo && (
                            <div className="report-image-thumb" onClick={() => setLightbox({ src: report.incident_photo, title: `Incident Photo - ${report.area}` })}>
                              <img src={report.incident_photo} alt="Incident" />
                              <div className="image-label-badge">Incident</div>
                            </div>
                          )}
                          {report.place_photo && (
                            <div className="report-image-thumb" onClick={() => setLightbox({ src: report.place_photo, title: `Place Photo - ${report.area}` })}>
                              <img src={report.place_photo} alt="Place" />
                              <div className="image-label-badge">Place</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ minWidth: '150px', maxWidth: '250px' }}>
                      {report.remarks ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.03)', borderLeft: '3px solid var(--accent-gold)', padding: '6px 10px', borderRadius: '4px', lineHeight: '1.4' }}>
                          {report.remarks}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{report.uploader_name || report.officer_name || 'Officer'}</div>
                      {report.uploader_employee_id && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          ID: {report.uploader_employee_id}
                        </div>
                      )}
                      {report.uploader_role && (
                        <div style={{ marginTop: '4px' }}>
                          <span className="priority-badge priority-low" style={{ fontSize: '0.72rem', padding: '1px 5px' }}>
                            {report.uploader_role}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{report.uploader_zone || '—'}</span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{report.uploader_division || '—'}</span>
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
                      <span className={`status-pill status-${report.status.replace('_', '-')}`}>{report.status === 'resolved' ? 'resolved' : report.status.replace('_', ' ')}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(report.created_at).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select defaultValue={report.status} onChange={e => handleStatusUpdate(report.id, e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', background: '#18181b', color: '#ffffff', outline: 'none', fontSize: '0.85rem' }}>
                          <option value="pending">Pending</option>
                          <option value="in_review">In Review</option>
                          <option value="resolved">Resolved</option>
                        </select>
                        <button
                          onClick={() => handleDeleteReport(report.id)}
                          className="theme-toggle-btn-small"
                          style={{
                            color: 'var(--danger-red)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            background: 'rgba(239, 68, 68, 0.05)',
                            width: '34px',
                            height: '34px',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          title="Delete Report"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan="13" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No reports available in this folder.</td>
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

export default AllIncidentsPage;
