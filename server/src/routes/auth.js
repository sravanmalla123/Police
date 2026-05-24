import express from 'express';
import { login, officers, createStaff, deleteStaff, impersonate, getMe } from '../controllers/authController.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import { validateLogin } from '../middleware/validate.js';

const router = express.Router();

router.post('/login', loginLimiter, validateLogin, login);
router.get('/me', authMiddleware, getMe);
router.get('/officers', authMiddleware, officers); // Used to list officers/staff

router.post('/users', authMiddleware, adminMiddleware, createStaff);
router.delete('/users/:id', authMiddleware, adminMiddleware, deleteStaff);
router.post('/impersonate', authMiddleware, adminMiddleware, impersonate);

export default router;
