import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  fetchOfficers, 
  createStaffUser, 
  deleteStaffUser,
  impersonateUser,
  setAuthToken 
} from '../services/api.js';

const zones = ['West', 'East', 'Rural'];
const divisions = ['West', 'South', 'North', 'Central', 'Nandigama', 'Mylavaram'];

function StaffManagementPage({ auth, onLogin, onLogout, theme, toggleTheme }) {
  const navigate = useNavigate();
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // Staff creation form state
  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('CI');
  const [newStaffAccessModes, setNewStaffAccessModes] = useState([]);
  const [newStaffZone, setNewStaffZone] = useState('West');
  const [newStaffDivision, setNewStaffDivision] = useState('West');
  const [newStaffReportingStation, setNewStaffReportingStation] = useState('');
  const [staffSubmitLoading, setStaffSubmitLoading] = useState(false);

  const loadOfficers = async () => {
    setLoading(true);
    try {
      const data = await fetchOfficers();
      setOfficers(data.officers || []);
    } catch (err) {
      setMessage('Unable to load staff logins.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auth?.token) setAuthToken(auth.token);
    loadOfficers();
  }, []);

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!newStaffId.trim() || !newStaffPassword.trim()) {
      setMessage('Employee ID and Password are required.');
      return;
    }
    setStaffSubmitLoading(true);
    setMessage('');
    try {
      const res = await createStaffUser({
        employeeId: newStaffId,
        name: newStaffName,
        role: newStaffRole,
        password: newStaffPassword,
        zone: newStaffZone,
        division: newStaffDivision,
        reportingStation: newStaffReportingStation,
        accessModes: newStaffAccessModes.join(',')
      });
      const createdUser = res.user || res;
      setMessage(`Staff account for ${createdUser.name || createdUser.employee_id} (${createdUser.role}) created successfully.`);
      setNewStaffId('');
      setNewStaffName('');
      setNewStaffPassword('');
      setNewStaffRole('CI');
      setNewStaffAccessModes([]);
      setNewStaffZone('West');
      setNewStaffDivision('West');
      setNewStaffReportingStation('');
      loadOfficers();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to create staff account.');
    } finally {
      setStaffSubmitLoading(false);
    }
  };

  const handleDeleteStaff = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the login account for ${name}?`)) {
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await deleteStaffUser(id);
      setMessage(`Staff account for ${name} deleted successfully.`);
      loadOfficers();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to delete staff account.');
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async (employeeId) => {
    setLoading(true);
    setMessage('');
    try {
      const resp = await impersonateUser(employeeId);
      const normalized = {
        token: resp.token,
        user: resp.user,
        role: resp.user?.role || 'staff'
      };
      localStorage.setItem('police-portal-auth', JSON.stringify(normalized));
      setAuthToken(normalized.token);
      onLogin(normalized);
      navigate('/staff');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to authenticate for direct login.');
    } finally {
      setLoading(false);
    }
  };

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
            <h1>Staff Login Accounts Management</h1>
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
          <h2>Staff Login Accounts Management</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
            As Commissioner, you can add or remove login accounts for officers on duty. Set an Employee ID, Access Mode (SB Control, SB Periscope, or SB DSR), Zone, Division, and Password.
          </p>

          <div className="grid-2" style={{ gap: '24px', alignItems: 'start' }}>
            {/* Create Staff Form */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#ffffff', fontSize: '1.1rem' }}>Create Staff Account</h3>
              <form onSubmit={handleCreateStaff} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-field">
                  <label htmlFor="staffId">Employee ID (Login ID)</label>
                  <input
                    id="staffId"
                    type="text"
                    value={newStaffId}
                    onChange={e => setNewStaffId(e.target.value)}
                    placeholder="e.g. si002"
                    required
                    style={{ background: 'rgba(5,7,12,0.6)', border: '1px solid var(--border-light)' }}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="staffName">Officer Name (Optional)</label>
                  <input
                    id="staffName"
                    type="text"
                    value={newStaffName}
                    onChange={e => setNewStaffName(e.target.value)}
                    placeholder="e.g. Satish Kumar"
                    style={{ background: 'rgba(5,7,12,0.6)', border: '1px solid var(--border-light)' }}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="staffRole">Role</label>
                  <select
                    id="staffRole"
                    value={newStaffRole}
                    onChange={e => setNewStaffRole(e.target.value)}
                    style={{ background: '#121624', border: '1px solid var(--border-light)', color: '#ffffff' }}
                  >
                    <option value="CI">CI</option>
                    <option value="SI">SI</option>
                    <option value="WSI">WSI</option>
                    <option value="ASI">ASI</option>
                    <option value="HC">HC</option>
                    <option value="PC">PC</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-field">
                  <label style={{ marginBottom: '6px', display: 'block' }}>Access Modes</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px' }}>
                    {['SB Control', 'SB Periscope', 'SB DSR'].map(mode => (
                      <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        <input
                          type="checkbox"
                          checked={newStaffAccessModes.includes(mode)}
                          onChange={e => {
                            if (e.target.checked) {
                              setNewStaffAccessModes(prev => [...prev, mode]);
                            } else {
                              setNewStaffAccessModes(prev => prev.filter(m => m !== mode));
                            }
                          }}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                        {mode}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="staffZone">Zone</label>
                  <select
                    id="staffZone"
                    value={newStaffZone}
                    onChange={e => setNewStaffZone(e.target.value)}
                    style={{ background: '#121624', border: '1px solid var(--border-light)', color: '#ffffff' }}
                  >
                    {zones.map(z => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="staffDivision">Division</label>
                  <select
                    id="staffDivision"
                    value={newStaffDivision}
                    onChange={e => setNewStaffDivision(e.target.value)}
                    style={{ background: '#121624', border: '1px solid var(--border-light)', color: '#ffffff' }}
                  >
                    {divisions.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="staffReportingStation">Reporting Station</label>
                  <input
                    id="staffReportingStation"
                    type="text"
                    value={newStaffReportingStation}
                    onChange={e => setNewStaffReportingStation(e.target.value)}
                    placeholder="e.g. Bhavanipuram PS"
                    style={{ background: 'rgba(5,7,12,0.6)', border: '1px solid var(--border-light)' }}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="staffPassword">Password</label>
                  <input
                    id="staffPassword"
                    type="password"
                    value={newStaffPassword}
                    onChange={e => setNewStaffPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ background: 'rgba(5,7,12,0.6)', border: '1px solid var(--border-light)' }}
                  />
                </div>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={staffSubmitLoading || loading}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  {staffSubmitLoading ? 'Creating Account…' : 'Generate Staff Credentials'}
                </button>
              </form>
            </div>

            {/* Existing Staff List */}
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#ffffff', fontSize: '1.1rem' }}>Active Staff Logins</h3>
              <div className="table-wrap" style={{ maxHeight: '520px', overflowY: 'auto' }}>
                <table className="table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Officer Name</th>
                      <th>Role</th>
                      <th>Access Modes</th>
                      <th>Zone</th>
                      <th>Division</th>
                      <th>Reporting Station</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officers.map(off => (
                      <tr key={off.id}>
                        <td>
                          <code style={{ color: 'var(--accent-gold)' }}>{off.employee_id}</code>
                        </td>
                        <td>
                          <strong>{off.name}</strong>
                        </td>
                        <td>
                          <span className="priority-badge priority-low" style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                            {off.role}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {off.access_modes ? off.access_modes.split(',').map(mode => (
                              <span key={mode} className="priority-badge priority-low" style={{ fontSize: '0.75rem', padding: '2px 6px', background: 'rgba(52, 211, 153, 0.1)', color: 'var(--success-green)', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
                                {mode.trim()}
                              </span>
                            )) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                          </div>
                        </td>
                        <td>
                          <span>{off.zone || '—'}</span>
                        </td>
                        <td>
                          <span>{off.division || '—'}</span>
                        </td>
                        <td>
                          <span>{off.reporting_station || '—'}</span>
                        </td>
                        <td style={{ textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end', border: 'none' }}>
                          <button
                            type="button"
                            onClick={() => handleImpersonate(off.employee_id)}
                            className="theme-toggle-btn-small"
                            style={{ 
                              background: 'var(--accent-gold-glow)', 
                              color: 'var(--accent-gold)', 
                              border: '1px solid rgba(251, 191, 36, 0.2)', 
                              padding: '4px 8px', 
                              borderRadius: '4px', 
                              cursor: 'pointer' 
                            }}
                            title="Directly login as this user without password"
                            disabled={loading}
                          >
                            Login
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStaff(off.id, off.name)}
                            className="theme-toggle-btn-small"
                            style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'rgba(239, 68, 68, 0.9)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                            title="Delete Login Account"
                            disabled={loading}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {officers.length === 0 && !loading && (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
                          No staff accounts found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StaffManagementPage;
