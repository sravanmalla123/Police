import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import StaffDashboard from './pages/StaffDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AllIncidentsPage from './pages/AllIncidentsPage.jsx';
import StaffManagementPage from './pages/StaffManagementPage.jsx';
import './styles.css';
import { setAuthToken, fetchCurrentUser } from './services/api.js';

const LOCAL_KEY = 'police-portal-auth';

/**
 * Reads the stored auth object and validates that the JWT has not expired.
 * Returns null if missing or expired, so the user is redirected to login.
 */
function loadValidAuth() {
  try {
    const stored = localStorage.getItem(LOCAL_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed?.token) return null;

    // Decode JWT payload (base64url) — no library needed
    const payloadB64 = parsed.token.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiry (exp is in seconds, Date.now() is in ms)
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(LOCAL_KEY);
      return null;
    }
    if (payload.employeeId && parsed.user && !parsed.user.employee_id) {
      parsed.user.employee_id = payload.employeeId;
    }
    return parsed;
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return null;
  }
}

function App() {
  const [auth, setAuth] = useState(loadValidAuth);
  const [theme, setTheme] = useState(() => localStorage.getItem('police-portal-theme') || 'light');
  const navigate = useNavigate();

  // Sync theme to body class and localStorage
  useEffect(() => {
    localStorage.setItem('police-portal-theme', theme);
    document.body.classList.toggle('light-theme', theme === 'light');
  }, [theme]);

  // Sync auth token to axios on change
  useEffect(() => {
    if (auth) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(auth));
      setAuthToken(auth.token);
    } else {
      localStorage.removeItem(LOCAL_KEY);
      setAuthToken(null);
    }
  }, [auth]);

  // Sync/enrich auth profile with DB on load
  useEffect(() => {
    if (auth?.token) {
      let isMounted = true;
      fetchCurrentUser()
        .then((res) => {
          if (isMounted && res.success && res.user) {
            setAuth((prev) => {
              if (!prev) return prev;
              if (prev.user?.employee_id === res.user.employee_id) return prev;
              return {
                ...prev,
                user: {
                  ...prev.user,
                  ...res.user
                }
              };
            });
          }
        })
        .catch((err) => {
          console.error('Failed to auto-refresh profile:', err);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [auth?.token]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const logout = () => {
    setAuth(null);
    navigate('/', { replace: true });
  };

  return (
    <div className="app-shell">
      <Routes>
        <Route
          path="/"
          element={<LoginPage onLogin={setAuth} theme={theme} toggleTheme={toggleTheme} />}
        />
        <Route
          path="/staff"
          element={
            auth && auth.role !== 'admin' ? (
              <StaffDashboard auth={auth} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin"
          element={
            auth && auth.role === 'admin' ? (
              <AdminDashboard auth={auth} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin/incidents"
          element={
            auth && auth.role === 'admin' ? (
              <AllIncidentsPage auth={auth} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin/staff"
          element={
            auth && auth.role === 'admin' ? (
              <StaffManagementPage auth={auth} onLogin={setAuth} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
