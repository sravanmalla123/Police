import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, setAuthToken } from '../services/api.js';

const roles = ['CI', 'SI', 'Constable', 'Other'];

function LoginPage({ onLogin, theme, toggleTheme }) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [payload, setPayload] = useState({ loginId: '', password: '', role: roles[0] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => (payload.loginId || '').trim() && (payload.password || '').trim(), [payload]);

  useEffect(() => {
    setError('');
    setPayload(prev => ({ ...prev, loginId: '', password: '' }));
  }, [isAdmin]);

  const handleChange = event => {
    const { name, value } = event.target;
    setPayload(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');

    if (!canSubmit) {
      setError('Please enter both ID and password.');
      return;
    }

    setLoading(true);

    try {
      const body = {
        loginId: payload.loginId,
        password: payload.password,
        role: isAdmin ? 'admin' : payload.role
      };

      const resp = await loginUser(body);
      const normalized = {
        token: resp.token,
        user: resp.user,
        role: resp.user?.role || 'staff'
      };
      localStorage.setItem('police-portal-auth', JSON.stringify(normalized));
      setAuthToken(normalized.token);
      onLogin(normalized);
      navigate(normalized.role === 'admin' ? '/admin' : '/staff');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to login. Please check your credentials.');
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
            style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.15))' }} 
          />
          <div className="brand-copy">
            <h1 style={{ letterSpacing: '0.03em' }}>Andhra Pradesh Police</h1>
            <p>State Headquarters Command Center & Operational Portals.</p>
          </div>
        </div>
        <button 
          className="theme-toggle-btn" 
          onClick={toggleTheme} 
          aria-label="Toggle theme"
          type="button"
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      </div>

      <div className="page-body">
        <div className="grid-2">
          <div className="card">
            <h2>Sign In</h2>
            
            <div className="form-field">
              <label>Access Mode</label>
              <div className="tabs-row">
                <button
                  type="button"
                  className={`tab-btn ${!isAdmin ? 'active' : ''}`}
                  onClick={() => setIsAdmin(false)}
                >
                  Police Staff
                </button>
                <button
                  type="button"
                  className={`tab-btn ${isAdmin ? 'active' : ''}`}
                  onClick={() => setIsAdmin(true)}
                >
                  Commissioner
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              {!isAdmin && (
                <div className="form-field">
                  <label htmlFor="role">Role / Rank</label>
                  <select id="role" name="role" value={payload.role} onChange={handleChange}>
                    {roles.map(role => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-field">
                <label htmlFor="loginId">ID / Employee ID</label>
                <input id="loginId" name="loginId" value={payload.loginId} onChange={handleChange} placeholder="Enter your ID" />
              </div>

              <div className="form-field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" value={payload.password} onChange={handleChange} placeholder="Enter password" />
              </div>

              {error && <div className="alert error">{error}</div>}

              <button className="button-primary" type="submit" disabled={loading}>
                {loading ? 'Authenticating…' : isAdmin ? 'Authorize as Commissioner' : 'Authorize as Staff'}
              </button>
            </form>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
              <img 
                src="/ap_police_banner.png" 
                alt="AP Police Banner" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to top, rgba(18,18,20,0.95), rgba(18,18,20,0.3))' }} />
              <div style={{ position: 'absolute', bottom: '12px', left: '12px' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--primary)', fontWeight: 'bold' }}>Command Center</span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.1rem', color: '#ffffff' }}>State Security Portal</h3>
              </div>
            </div>

            <div>
              <h2>Security Operations Center</h2>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
                This portal is the central entry point for the security operations of the Andhra Pradesh State Police force.
              </div>
              
              <div className="report-card" style={{ marginTop: '16px', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '0.95rem', textTransform: 'uppercase', color: 'var(--danger-red)', letterSpacing: '0.05em' }}>Access Warning</h3>
                <p style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  This system contains restricted data. Unauthorized login attempts, data scanning, or modification of dispatch logs will be prosecuted to the fullest extent under the law.
                </p>
              </div>

              <div className="report-card">
                <h3 style={{ fontSize: '0.95rem', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '0.05em' }}>System Telemetry</h3>
                <div style={{ display: 'grid', gap: '8px', marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <div><strong>Portal Status:</strong> <span style={{ color: 'var(--success-green)', fontWeight: 'bold' }}>SECURE / ONLINE</span></div>
                  <div><strong>Incident Stream:</strong> <span style={{ color: 'var(--success-green)' }}>ACTIVE (SSE)</span></div>
                  <div><strong>Encryption:</strong> <span>AES-256 TLS 1.3</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
