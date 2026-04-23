/**
 * @file admin.routes.ts
 * @description Express router for admin-only endpoints.
 *              All routes are prefixed with /api/admin and require admin role.
 */

import { Router }      from 'express';
import { getAdminStats, getAllUsers, getAllSessions } from '../controllers/admin.controller';
import { protect, requireRole } from '../middleware/auth.middleware';

const router = Router();

/** All admin routes require authentication + admin role */
router.use(protect);
router.use(requireRole('admin'));

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get platform-wide analytics (admin only)
 *     tags: [Admin]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Full platform stats payload
 *       403:
 *         description: Admin role required
 */
router.get('/stats',    getAdminStats);
router.get('/users',    getAllUsers);
router.get('/sessions', getAllSessions);

export default router;
