import { db } from '../config/db.js';
import { isValidImageDataUrl } from '../utils/imageValidator.js';

// ── In-memory SSE registry (max 500 clients) ──────────────────────────────────
const MAX_SSE_CLIENTS = 500;
const sseClients = new Set();

export function registerSseClient(res) {
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    const oldest = sseClients.values().next().value;
    sseClients.delete(oldest);
    try { oldest.end(); } catch (_) {}
  }
  sseClients.add(res);
}

export function unregisterSseClient(res) {
  sseClients.delete(res);
}

export function sendSseEvent(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch (_) { sseClients.delete(client); }
  }
}

// ── Translation cache (max 500 entries, evicts oldest) ────────────────────────
const MAX_CACHE = 500;
const translationCache = new Map();

function cacheSet(key, value) {
  if (translationCache.size >= MAX_CACHE) {
    translationCache.delete(translationCache.keys().next().value);
  }
  translationCache.set(key, value);
}

async function translateText(text, targetLang) {
  if (!targetLang || targetLang === 'original') return text;
  const cacheKey = `${text}_${targetLang}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

  let result = `[${targetLang}] ${text}`;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const json = await resp.json();
      if (Array.isArray(json?.[0])) {
        result = json[0]
          .map(x => x?.[0])
          .filter(x => typeof x === 'string')
          .join('');
      }
    }
  } catch (_) {}

  cacheSet(cacheKey, result);
  return result;
}

async function populateTranslations(report, lang) {
  if (!report) return;
  report.translations = {};
  if (lang && lang !== 'original') {
    const translated = await translateText(report.description, lang);
    report.translated_description = translated;
    report.translations[lang] = translated;
  } else {
    report.translated_description = report.description;
  }
}

// ── Report Queries ────────────────────────────────────────────────────────────

export async function getMyReports(userId, accessMode, lang) {
  const rows = await db.all(
    `SELECT r.*, u.name as uploader_name, u.role as uploader_role, u.employee_id as uploader_employee_id, u.zone as uploader_zone, u.division as uploader_division 
     FROM reports r 
     LEFT JOIN users u ON r.user_id = u.id 
     WHERE r.user_id = ? AND r.access_mode = ?
     ORDER BY r.created_at DESC`,
    [userId, accessMode]
  );
  await Promise.all(rows.map((r) => populateTranslations(r, lang)));
  return rows;
}

export async function createReport({ userId, area, station, officerName, priority, description, latitude, longitude, incident_photo, place_photo, remarks, accessMode, incident_date }) {
  if (!isValidImageDataUrl(incident_photo)) {
    const err = new Error('Invalid incident photo format.'); err.status = 400; throw err;
  }
  if (!isValidImageDataUrl(place_photo)) {
    const err = new Error('Invalid place photo format.'); err.status = 400; throw err;
  }

  const result = await db.run(
    `INSERT INTO reports
      (user_id, area, station, officer_name, priority, description, status, sent_to_commissioner, latitude, longitude, incident_photo, place_photo, remarks, access_mode, incident_date)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, area, station, officerName, priority, description,
     latitude ?? null, longitude ?? null, incident_photo || null, place_photo || null, remarks || null, accessMode || 'SB Control', incident_date || null]
  );

  const report = await db.get(
    `SELECT r.*, u.name as uploader_name, u.role as uploader_role, u.employee_id as uploader_employee_id, u.zone as uploader_zone, u.division as uploader_division 
     FROM reports r 
     LEFT JOIN users u ON r.user_id = u.id 
     WHERE r.id = ?`,
    [result.insertId]
  );
  await populateTranslations(report, null);
  sendSseEvent('new_report', report);
  return report;
}

export async function editReport({
  reportId, userId, role, area, station, officerName, priority, description, latitude, longitude, incident_photo, place_photo, remarks, status, incident_date
}) {
  const existing = await db.get('SELECT * FROM reports WHERE id = ?', [reportId]);
  if (!existing) {
    const err = new Error('Report not found.'); err.status = 404; throw err;
  }

  // Only the creator of the report or an admin can edit
  if (role !== 'admin' && existing.user_id !== userId) {
    const err = new Error('Unauthorized to edit this report.'); err.status = 403; throw err;
  }

  if (incident_photo && incident_photo !== existing.incident_photo && !isValidImageDataUrl(incident_photo)) {
    const err = new Error('Invalid incident photo format.'); err.status = 400; throw err;
  }
  if (place_photo && place_photo !== existing.place_photo && !isValidImageDataUrl(place_photo)) {
    const err = new Error('Invalid place photo format.'); err.status = 400; throw err;
  }

  let finalStatus = existing.status;
  if (status) {
    const allowed = ['pending', 'in_review', 'resolved'];
    if (!allowed.includes(status)) {
      const err = new Error('Invalid status value.'); err.status = 400; throw err;
    }
    finalStatus = status;
  }

  await db.run(
    `UPDATE reports SET
      area = ?,
      station = ?,
      officer_name = ?,
      priority = ?,
      description = ?,
      latitude = ?,
      longitude = ?,
      incident_photo = ?,
      place_photo = ?,
      remarks = ?,
      status = ?,
      incident_date = ?,
      updated_at = NOW()
     WHERE id = ?`,
    [
      area,
      station,
      officerName || existing.officer_name,
      priority,
      description,
      latitude ?? null,
      longitude ?? null,
      incident_photo || null,
      place_photo || null,
      remarks || null,
      finalStatus,
      incident_date || existing.incident_date || null,
      reportId
    ]
  );

  const updated = await db.get(
    `SELECT r.*, u.name as uploader_name, u.role as uploader_role, u.employee_id as uploader_employee_id, u.zone as uploader_zone, u.division as uploader_division 
     FROM reports r 
     LEFT JOIN users u ON r.user_id = u.id 
     WHERE r.id = ?`,
    [reportId]
  );
  await populateTranslations(updated, null);
  sendSseEvent('report_updated', updated);
  return updated;
}

export async function getAdminReports({ area, station, priority, status, sortBy, lang }) {
  const conditions = ['sent_to_commissioner = 1'];
  const values = [];

  if (area) { conditions.push('area LIKE ?'); values.push(`%${area}%`); }
  if (station) { conditions.push('station LIKE ?'); values.push(`%${station}%`); }
  if (priority && priority !== 'All') { conditions.push('priority = ?'); values.push(priority); }
  if (status && status !== 'All') { conditions.push('status = ?'); values.push(status); }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const orderMap = {
    Oldest: 'ORDER BY created_at ASC',
    Priority: "ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 END ASC",
  };
  const order = orderMap[sortBy] || 'ORDER BY created_at DESC';

  const rows = await db.all(
    `SELECT r.*, u.name as uploader_name, u.role as uploader_role, u.employee_id as uploader_employee_id, u.zone as uploader_zone, u.division as uploader_division 
     FROM reports r 
     LEFT JOIN users u ON r.user_id = u.id 
     ${whereClause} ${order}`,
    values
  );
  await Promise.all(rows.map((r) => populateTranslations(r, lang)));
  return rows;
}

export async function updateReportStatus(reportId, status) {
  const allowed = ['pending', 'in_review', 'resolved'];
  if (!allowed.includes(status)) {
    const err = new Error('Invalid status value.'); err.status = 400; throw err;
  }

  const check = await db.get('SELECT id FROM reports WHERE id = ?', [reportId]);
  if (!check) { const err = new Error('Report not found.'); err.status = 404; throw err; }

  await db.run('UPDATE reports SET status = ?, updated_at = NOW() WHERE id = ?', [status, reportId]);
  const updated = await db.get(
    `SELECT r.*, u.name as uploader_name, u.role as uploader_role, u.employee_id as uploader_employee_id, u.zone as uploader_zone, u.division as uploader_division 
     FROM reports r 
     LEFT JOIN users u ON r.user_id = u.id 
     WHERE r.id = ?`,
    [reportId]
  );
  await populateTranslations(updated, null);
  sendSseEvent('report_updated', updated);
  return updated;
}

export async function assignOfficer(reportId, assignedOfficer) {
  const check = await db.get('SELECT id FROM reports WHERE id = ?', [reportId]);
  if (!check) { const err = new Error('Report not found.'); err.status = 404; throw err; }

  await db.run(
    'UPDATE reports SET assigned_officer = ?, updated_at = NOW() WHERE id = ?',
    [assignedOfficer || null, reportId]
  );
  const updated = await db.get(
    `SELECT r.*, u.name as uploader_name, u.role as uploader_role, u.employee_id as uploader_employee_id, u.zone as uploader_zone, u.division as uploader_division 
     FROM reports r 
     LEFT JOIN users u ON r.user_id = u.id 
     WHERE r.id = ?`,
    [reportId]
  );
  await populateTranslations(updated, null);
  sendSseEvent('report_updated', updated);
  return updated;
}

// ── Bulletins ─────────────────────────────────────────────────────────────────

export async function createBulletin({ message, severity }) {
  const result = await db.run(
    'INSERT INTO bulletins (message, severity) VALUES (?, ?)',
    [message, severity]
  );
  const bulletin = await db.get('SELECT * FROM bulletins WHERE id = ?', [result.insertId]);
  sendSseEvent('new_bulletin', bulletin);
  return bulletin;
}

export async function getBulletins() {
  return db.all('SELECT * FROM bulletins ORDER BY id DESC LIMIT 15');
}

export async function deleteReportService({ reportId, userId, role }) {
  const existing = await db.get('SELECT * FROM reports WHERE id = ?', [reportId]);
  if (!existing) {
    const err = new Error('Report not found.');
    err.status = 404;
    throw err;
  }

  // Only the creator of the report or an admin can delete it
  if (role !== 'admin' && existing.user_id !== userId) {
    const err = new Error('Unauthorized to delete this report.');
    err.status = 403;
    throw err;
  }

  await db.run('DELETE FROM reports WHERE id = ?', [reportId]);
  sendSseEvent('report_deleted', { id: Number(reportId) });
}

