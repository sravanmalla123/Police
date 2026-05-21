import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import StaffDashboard from './pages/StaffDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import './styles.css';
import { setAuthToken } from './services/api.js';

const LOCAL_KEY = 'police-portal-auth';

function App() {
  const [auth, setAuth] = useState(() => {
    const stored = localStorage.getItem(LOCAL_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('police-portal-theme');
    return saved || 'dark';
  });
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('police-portal-theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);

  useEffect(() => {
    if (auth) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(auth));
      setAuthToken(auth.token);
    } else {
      localStorage.removeItem(LOCAL_KEY);
      setAuthToken(null);
    }
  }, [auth]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const logout = () => {
    setAuth(null);
    navigate('/');
  };

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<LoginPage onLogin={setAuth} theme={theme} toggleTheme={toggleTheme} />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
