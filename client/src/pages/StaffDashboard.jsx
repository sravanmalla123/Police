import { useEffect, useMemo, useState, useRef } from 'react';
import { fetchMyReports, submitReport, updateReportDetails, setAuthToken, fetchBulletins, getSseStreamUrl, deleteReport } from '../services/api.js';

const formatDayDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_) {
    return dateStr;
  }
};

function StaffDashboard({ auth, onLogout, theme, toggleTheme }) {
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({ 
    area: auth?.user?.zone && auth?.user?.division ? `${auth.user.zone} Zone, ${auth.user.division} Division` : '', 
    station: auth?.user?.reporting_station || '', 
    officerName: auth?.user?.name || '', 
    priority: 'High', 
    incident_date: new Date().toISOString().split('T')[0],
    description: '', 
    latitude: '', 
    longitude: '', 
    incident_photo: '', 
    place_photo: '', 
    remarks: '', 
    status: 'pending' 
  });
  const [editingReportId, setEditingReportId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
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
  const jwtEmployeeId = useMemo(() => {
    try {
      if (auth?.token) {
        const payloadB64 = auth.token.split('.')[1];
        if (payloadB64) {
          const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
          return payload.employeeId;
        }
      }
    } catch (_) {}
    return null;
  }, [auth?.token]);
  const [mapInstance, setMapInstance] = useState(null);
  const [mapMarker, setMapMarker] = useState(null);
  const [bulletins, setBulletins] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

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
        mapInstance.setView([lat, lng], 10);
      }
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

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('Are you sure you want to delete this incident report?')) return;
    setLoading(true);
    try {
      await deleteReport(reportId);
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (error) {
      setMessage('Unable to delete report.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support Speech Recognition. Please use Chrome, Edge, Safari, or another modern browser.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
      setIsListening(false);
    } else {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = false;
      
      let recLang = 'en-IN';
      if (lang === 'hi') recLang = 'hi-IN';
      else if (lang === 'te') recLang = 'te-IN';
      else if (lang === 'es') recLang = 'es-ES';
      else if (lang === 'fr') recLang = 'fr-FR';
      
      rec.lang = recLang;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onerror = (e) => {
        console.error('Speech recognition error', e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onresult = (event) => {
        const resultIndex = event.resultIndex;
        const transcript = event.results[resultIndex][0].transcript;
        if (transcript) {
          setForm(prev => ({
            ...prev,
            description: prev.description 
              ? `${prev.description.trim()} ${transcript.trim()}`
              : transcript.trim()
          }));
        }
      };

      recognitionRef.current = rec;
      try {
        rec.start();
      } catch (err) {
        console.error('Failed to start speech recognition', err);
        setIsListening(false);
      }
    }
  };


  const handleChange = event => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e, type) => {
    setMessage('⚠️ Image upload is disabled to comply with serverless payload size limits.');
  };

  const handleRemoveFile = (type) => {
    setForm(prev => ({
      ...prev,
      [type]: ''
    }));
  };

  const handleGPSCapture = () => {
    if (!navigator.geolocation) {
      setMessage('⚠️ Geolocation is not supported by this browser. Please enter coordinates manually.');
      return;
    }
    setMessage('Requesting GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setForm(prev => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        }));
        setMessage('✅ GPS location captured successfully.');
        if (mapInstance) mapInstance.setView([lat, lng], 10);
      },
      (geoError) => {
        // GPS denied or unavailable — do NOT insert fake coordinates
        const messages = {
          1: '⚠️ GPS permission denied. Please enable location access in your browser settings, or click the map to pin the incident location manually.',
          2: '⚠️ GPS position unavailable. Please click the map to pin the incident location manually.',
          3: '⚠️ GPS request timed out. Please click the map to pin the incident location manually.',
        };
        setMessage(messages[geoError.code] || '⚠️ Unable to get GPS location. Please pin the location on the map.');
      }
    );
  };

  const handleStartEdit = report => {
    setEditingReportId(report.id);
    setForm({
      area: report.area,
      station: report.station,
      officerName: report.officer_name || '',
      priority: report.priority || 'Medium',
      incident_date: report.incident_date ? report.incident_date.split('T')[0] : new Date().toISOString().split('T')[0],
      description: report.description || '',
      latitude: report.latitude !== null && report.latitude !== undefined ? String(report.latitude) : '',
      longitude: report.longitude !== null && report.longitude !== undefined ? String(report.longitude) : '',
      incident_photo: report.incident_photo || '',
      place_photo: report.place_photo || '',
      remarks: report.remarks || '',
      status: report.status || 'pending'
    });
    const formTitle = document.getElementById('incident-form-title');
    if (formTitle) {
      formTitle.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelEdit = () => {
    setEditingReportId(null);
    setForm({
      area: auth?.user?.zone && auth?.user?.division ? `${auth.user.zone} Zone, ${auth.user.division} Division` : '',
      station: auth?.user?.reporting_station || '',
      officerName: auth?.user?.name || '',
      priority: 'High',
      incident_date: new Date().toISOString().split('T')[0],
      description: '',
      latitude: '',
      longitude: '',
      incident_photo: '',
      place_photo: '',
      remarks: '',
      status: 'pending'
    });
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      if (editingReportId) {
        await updateReportDetails(editingReportId, {
          ...form,
          officerName: form.officerName || auth?.user?.name || 'Officer',
          station: form.station || 'Central Station',
          latitude: form.latitude ? parseFloat(form.latitude) : null,
          longitude: form.longitude ? parseFloat(form.longitude) : null,
          remarks: form.remarks || null,
          status: form.status || 'pending'
        });
        setMessage('Report updated successfully.');
        setEditingReportId(null);
      } else {
        await submitReport({ 
          ...form, 
          officerName: auth?.user?.name || 'Officer', 
          station: form.station || 'Central Station',
          latitude: form.latitude ? parseFloat(form.latitude) : null,
          longitude: form.longitude ? parseFloat(form.longitude) : null,
          remarks: form.remarks || null,
          accessMode: auth?.user?.accessMode
        });
        setMessage('Report submitted successfully.');
      }
      setForm({
        area: auth?.user?.zone && auth?.user?.division ? `${auth.user.zone} Zone, ${auth.user.division} Division` : '',
        station: auth?.user?.reporting_station || '',
        officerName: auth?.user?.name || '',
        priority: 'High',
        incident_date: new Date().toISOString().split('T')[0],
        description: '',
        latitude: '',
        longitude: '',
        incident_photo: '',
        place_photo: '',
        remarks: '',
        status: 'pending'
      });
      await loadReports();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to submit report.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickStatusUpdate = async (report, newStatus) => {
    setLoading(true);
    setMessage('');
    try {
      await updateReportDetails(report.id, {
        area: report.area,
        station: report.station,
        officerName: report.officer_name,
        priority: report.priority,
        description: report.description,
        latitude: report.latitude ? parseFloat(report.latitude) : null,
        longitude: report.longitude ? parseFloat(report.longitude) : null,
        incident_photo: report.incident_photo || null,
        place_photo: report.place_photo || null,
        remarks: report.remarks || null,
        status: newStatus
      });
      setMessage('Status updated successfully.');
      await loadReports();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to update status.');
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
      const sseUrl = getSseStreamUrl(auth?.token || '');
      es = new EventSource(sseUrl);
      
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
            <h1>Officer Command Center</h1>
            <p>Andhra Pradesh State Police Department</p>
          </div>
        </div>
        <div className="top-bar">
          <div className="top-bar-user">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>
              Rank: <strong>{auth?.user?.role}</strong> | Access Mode: <strong>{auth?.user?.accessMode}</strong> | {auth?.user?.name}
              {auth?.user?.reporting_station && ` | Station: ${auth.user.reporting_station}`}
              {auth?.user?.zone && ` | Zone: ${auth.user.zone}`}
              {auth?.user?.division && ` | Division: ${auth.user.division}`}
            </span>
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

        {/* Welcome Greeting Banner */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          marginBottom: '8px'
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-heading)',
              fontSize: '1.45rem',
              fontWeight: 800,
              background: theme === 'light' ? 'linear-gradient(to right, #0f172a, #2563eb)' : 'linear-gradient(to right, #ffffff, #d4d4d8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Welcome back, {auth?.user?.name || 'Officer'}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Authorized Duty Portal — Role: <strong style={{ color: 'var(--text-primary)' }}>{auth?.user?.role || 'Staff'}</strong> (Employee ID: <code>{auth?.user?.employee_id || auth?.user?.employeeId || jwtEmployeeId || 'N/A'}</code>)
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {auth?.user?.accessMode && (
              <span className="priority-badge priority-low" style={{ background: 'rgba(251, 191, 36, 0.1)', color: 'var(--accent-gold)', border: '1px solid rgba(251, 191, 36, 0.2)', fontSize: '0.75rem', padding: '4px 10px' }}>
                Mode: {auth.user.accessMode}
              </span>
            )}
            {auth?.user?.reporting_station && (
              <span className="priority-badge priority-low" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.2)', fontSize: '0.75rem', padding: '4px 10px' }}>
                Station: {auth.user.reporting_station}
              </span>
            )}
            {auth?.user?.zone && (
              <span className="priority-badge priority-low" style={{ background: 'rgba(52, 211, 153, 0.1)', color: 'var(--success-green)', border: '1px solid rgba(52, 211, 153, 0.2)', fontSize: '0.75rem', padding: '4px 10px' }}>
                {auth.user.zone} Zone
              </span>
            )}
            {auth?.user?.division && (
              <span className="priority-badge priority-low" style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.2)', fontSize: '0.75rem', padding: '4px 10px' }}>
                {auth.user.division} Division
              </span>
            )}
          </div>
        </div>

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
            <h2 id="incident-form-title">{editingReportId ? `Edit Incident Report #${editingReportId}` : 'File Incident Report'}</h2>
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
                <label htmlFor="incident_date">Incident Day & Date</label>
                <input type="date" id="incident_date" name="incident_date" value={form.incident_date || ''} onChange={handleChange} required />
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
                <label htmlFor="remarks">Remarks</label>
                <textarea id="remarks" name="remarks" value={form.remarks || ''} onChange={handleChange} placeholder="Add any initial remarks or follow-up notes..." />
              </div>
              {editingReportId && (
                <div className="form-field">
                  <label htmlFor="status">Case Status</label>
                  <select id="status" name="status" value={form.status || 'pending'} onChange={handleChange}>
                    <option value="pending">Pending</option>
                    <option value="in_review">In Review</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              )}
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
                <label>Evidence Attachments (Optional)</label>
                <div className="upload-grid">
                  {form.incident_photo ? (
                    <div className="preview-container">
                      <img src={form.incident_photo} alt="Incident Preview" />
                      <div className="image-label-badge">Incident Photo</div>
                      <button type="button" className="preview-remove-btn" onClick={() => handleRemoveFile('incident_photo')}>&times;</button>
                    </div>
                  ) : (
                    <div className="upload-card" style={{ opacity: 0.65, cursor: 'not-allowed' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span>Incident Photo (Disabled)</span>
                      <p style={{ color: 'var(--danger-red)', fontWeight: 'bold' }}>Blocked for Vercel/GitHub</p>
                      <input type="file" accept="image/*" disabled onChange={e => handleFileChange(e, 'incident_photo')} />
                    </div>
                  )}

                  {form.place_photo ? (
                    <div className="preview-container">
                      <img src={form.place_photo} alt="Place Preview" />
                      <div className="image-label-badge">Place Photo</div>
                      <button type="button" className="preview-remove-btn" onClick={() => handleRemoveFile('place_photo')}>&times;</button>
                    </div>
                  ) : (
                    <div className="upload-card" style={{ opacity: 0.65, cursor: 'not-allowed' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span>Place Photo (Disabled)</span>
                      <p style={{ color: 'var(--danger-red)', fontWeight: 'bold' }}>Blocked for Vercel/GitHub</p>
                      <input type="file" accept="image/*" disabled onChange={e => handleFileChange(e, 'place_photo')} />
                    </div>
                  )}
                </div>
              </div>
              <div className="form-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label htmlFor="description" style={{ margin: 0 }}>Incident Description</label>
                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      border: isListening ? '1px solid var(--danger-red)' : '1px solid var(--border-light)',
                      background: isListening ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: isListening ? 'var(--danger-red)' : 'var(--text-secondary)',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    title={isListening ? 'Stop recording' : 'Dictate description (Voice message to text)'}
                  >
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2.5"
                      style={{ animation: isListening ? 'pulse-glow 1.5s infinite' : 'none' }}
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                    <span>{isListening ? 'Listening... Speak Now' : 'Voice to Text'}</span>
                  </button>
                </div>
                <textarea id="description" name="description" value={form.description} onChange={handleChange} placeholder="Detail the event situation, location and required action..." required />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="button-primary" type="submit" disabled={loading} style={{ flex: 1 }}>
                  {loading ? 'Processing…' : (editingReportId ? 'Save Changes' : 'Submit Incident Report')}
                </button>
                {editingReportId && (
                  <button className="button-secondary" type="button" onClick={handleCancelEdit} style={{ flex: 1 }}>
                    Cancel Edit
                  </button>
                )}
              </div>
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
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span>Uploaded By: <strong style={{ color: 'var(--accent-gold)' }}>{report.uploader_name || report.officer_name || 'Officer'} ({report.uploader_role || 'Staff'}{report.uploader_employee_id ? ` - ID: ${report.uploader_employee_id}` : ''})</strong></span>
                  </div>

                  {report.incident_date && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <span>Occurred: <strong style={{ color: 'var(--text-primary)' }}>{formatDayDate(report.incident_date)}</strong></span>
                    </div>
                  )}
                  
                  <p style={{ minHeight: '40px' }}>{lang !== 'original' ? (report.translations?.[lang] || report.description) : report.description}</p>
                  {report.remarks && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.03)', borderLeft: '3px solid var(--accent-gold)', padding: '8px 12px', borderRadius: '4px', margin: '10px 0', lineHeight: '1.4' }}>
                      <strong style={{ color: 'var(--accent-gold)' }}>Remarks:</strong> {report.remarks}
                    </div>
                  )}
                  
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

                  {(report.incident_photo || report.place_photo) && (
                    <div className="report-images-row">
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
                  )}

                  <div className="report-card-meta">
                    <span className="report-card-date" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {new Date(report.created_at).toLocaleString()}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => handleStartEdit(report)}
                        style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px', height: 'auto', cursor: 'pointer' }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => handleDeleteReport(report.id)}
                        style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px', height: 'auto', cursor: 'pointer', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger-red)' }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        Delete
                      </button>
                      <div 
                        className={`status-pill status-${report.status.replace('_', '-')}`}
                        style={{ padding: 0, overflow: 'hidden', display: 'inline-flex', alignItems: 'center', gap: '6px', paddingLeft: '8px', cursor: 'pointer' }}
                      >
                        <select
                          value={report.status}
                          onChange={(e) => handleQuickStatusUpdate(report, e.target.value)}
                          style={{
                            padding: '4px 20px 4px 2px',
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            outline: 'none',
                            cursor: 'pointer',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            MozAppearance: 'none'
                          }}
                        >
                          <option value="pending" style={{ background: 'var(--bg-dark)', color: 'var(--accent-gold)' }}>PENDING</option>
                          <option value="in_review" style={{ background: 'var(--bg-dark)', color: 'var(--text-primary)' }}>IN REVIEW</option>
                          <option value="resolved" style={{ background: 'var(--bg-dark)', color: 'var(--success-green)' }}>RESOLVED</option>
                        </select>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', opacity: 0.7, pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>
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
