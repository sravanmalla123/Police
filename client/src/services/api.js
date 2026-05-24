import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000, // 30s timeout for large photo uploads
});

// ── Request interceptor — attach token automatically ──────────────────────────
api.interceptors.request.use(
  (config) => {
    const stored = localStorage.getItem('police-portal-auth');
    if (stored) {
      try {
        const { token } = JSON.parse(stored);
        if (token) config.headers.Authorization = `Bearer ${token}`;
      } catch (_) {}
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — handle token expiry globally ───────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;

    // If session expired or token is invalid, force logout
    if (status === 401 && (code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID')) {
      localStorage.removeItem('police-portal-auth');
      window.location.href = '/';
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function loginUser(payload) {
  const response = await api.post('/auth/login', payload);
  return response.data;
}

export async function fetchCurrentUser() {
  const response = await api.get('/auth/me');
  return response.data;
}

export async function fetchOfficers() {
  const response = await api.get('/auth/officers');
  return response.data;
}

export async function createStaffUser(payload) {
  const response = await api.post('/auth/users', payload);
  return response.data;
}

export async function deleteStaffUser(userId) {
  const response = await api.delete(`/auth/users/${userId}`);
  return response.data;
}

export async function impersonateUser(employeeId) {
  const response = await api.post('/auth/impersonate', { employeeId });
  return response.data;
}

// ── Reports ───────────────────────────────────────────────────────────────────
export async function fetchMyReports(lang = 'original') {
  const response = await api.get('/reports/my', { params: { lang } });
  return response.data;
}

export async function submitReport(payload) {
  const response = await api.post('/reports', payload);
  return response.data;
}

export async function updateReportDetails(reportId, payload) {
  const response = await api.put(`/reports/${reportId}`, payload);
  return response.data;
}

export async function fetchAdminReports(params) {
  const response = await api.get('/reports', { params });
  return response.data;
}

export async function updateReportStatus(reportId, status) {
  const response = await api.patch(`/reports/${reportId}/status`, { status });
  return response.data;
}

export async function assignOfficerToReport(reportId, assignedOfficer) {
  const response = await api.patch(`/reports/${reportId}/assign`, { assignedOfficer });
  return response.data;
}

export async function deleteReport(reportId) {
  const response = await api.delete(`/reports/${reportId}`);
  return response.data;
}


// ── Bulletins ─────────────────────────────────────────────────────────────────
export async function fetchBulletins() {
  const response = await api.get('/reports/bulletins');
  return response.data;
}

export async function broadcastBulletin(message, severity) {
  const response = await api.post('/reports/bulletins', { message, severity });
  return response.data;
}

// ── SSE Stream URL helper ─────────────────────────────────────────────────────
export function getSseStreamUrl(token) {
  // Note: SSE EventSource cannot send Authorization headers.
  // The backend validates via query param for this specific endpoint.
  return `${BASE_URL}/reports/stream?token=${encodeURIComponent(token)}`;
}

export default api;
