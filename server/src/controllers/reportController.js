import {
  getMyReports,
  createReport,
  editReport,
  getAdminReports,
  updateReportStatus,
  assignOfficer,
  createBulletin,
  getBulletins,
  registerSseClient,
  unregisterSseClient,
  deleteReportService,
} from '../services/reportService.js';
import { verifyToken } from '../utils/jwt.js';

export async function myReports(req, res, next) {
  try {
    const { lang } = req.query;
    const reports = await getMyReports(req.user.userId, req.user.accessMode || req.user.role, lang);
    return res.json({ success: true, reports });
  } catch (err) { next(err); }
}

export async function submitReport(req, res, next) {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Admin users cannot submit staff reports.' });
    }
    const { area, station, officerName, priority, description, latitude, longitude, incident_photo, place_photo, remarks, accessMode, incident_date } = req.body;
    const report = await createReport({
      userId: req.user.userId, area, station,
      officerName: officerName || req.user.name,
      priority, description,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      incident_photo, place_photo, remarks,
      accessMode: accessMode || req.user.accessMode || 'SB Control',
      incident_date
    });
    return res.status(201).json({ success: true, message: 'Report submitted successfully.', report });
  } catch (err) { next(err); }
}

export async function updateReport(req, res, next) {
  try {
    const { id } = req.params;
    const { area, station, officerName, priority, description, latitude, longitude, incident_photo, place_photo, remarks, status, incident_date } = req.body;
    const report = await editReport({
      reportId: id,
      userId: req.user.userId,
      role: req.user.role,
      area, station,
      officerName: officerName || req.user.name,
      priority, description,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      incident_photo, place_photo, remarks, status,
      incident_date
    });
    return res.json({ success: true, message: 'Report updated successfully.', report });
  } catch (err) { next(err); }
}

export async function adminReports(req, res, next) {
  try {
    const reports = await getAdminReports(req.query);
    return res.json({ success: true, reports });
  } catch (err) { next(err); }
}

export async function streamReports(req, res, next) {
  try {
    const token = req.query.token || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).end();
    verifyToken(token); // throws on invalid/expired
  } catch (_) {
    return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
  });
  res.write(':\n\n'); // SSE comment keep-alive handshake
  registerSseClient(res);

  // Heartbeat every 30s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(':\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterSseClient(res);
  });
}

export async function patchStatus(req, res, next) {
  try {
    const report = await updateReportStatus(req.params.id, req.body.status);
    return res.json({ success: true, message: 'Report status updated.', report });
  } catch (err) { next(err); }
}

export async function patchAssign(req, res, next) {
  try {
    const report = await assignOfficer(req.params.id, req.body.assignedOfficer);
    return res.json({ success: true, message: 'Officer assigned successfully.', report });
  } catch (err) { next(err); }
}

export async function postBulletin(req, res, next) {
  try {
    const bulletin = await createBulletin(req.body);
    return res.status(201).json({ success: true, message: 'Bulletin broadcasted.', bulletin });
  } catch (err) { next(err); }
}

export async function listBulletins(req, res, next) {
  try {
    const bulletins = await getBulletins();
    return res.json({ success: true, bulletins });
  } catch (err) { next(err); }
}

export async function removeReport(req, res, next) {
  try {
    const { id } = req.params;
    await deleteReportService({
      reportId: id,
      userId: req.user.userId,
      role: req.user.role
    });
    return res.json({ success: true, message: 'Report deleted successfully.' });
  } catch (err) { next(err); }
}
