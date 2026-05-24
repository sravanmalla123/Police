import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { validateReport, validateBulletin } from '../middleware/validate.js';
import {
  myReports,
  submitReport,
  updateReport,
  adminReports,
  streamReports,
  patchStatus,
  patchAssign,
  postBulletin,
  listBulletins,
  removeReport,
} from '../controllers/reportController.js';

const router = express.Router();

// Staff routes
router.get('/my', authMiddleware, myReports);
router.post('/', authMiddleware, validateReport, submitReport);
router.put('/:id', authMiddleware, validateReport, updateReport);
router.delete('/:id', authMiddleware, removeReport);

// SSE stream (auth handled inside controller via query token)
router.get('/stream', streamReports);

// Admin-only routes
router.get('/', authMiddleware, adminMiddleware, adminReports);
router.patch('/:id/status', authMiddleware, adminMiddleware, patchStatus);
router.patch('/:id/assign', authMiddleware, adminMiddleware, patchAssign);
router.post('/bulletins', authMiddleware, adminMiddleware, validateBulletin, postBulletin);
router.get('/bulletins', authMiddleware, listBulletins);

export default router;
