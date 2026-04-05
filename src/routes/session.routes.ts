/**
 * @file session.routes.ts
 * @description Express router for session management endpoints.
 *              All routes are prefixed with /api/sessions and require authentication.
 *              Role-based access is enforced per route.
 */

import { Router } from 'express';
import {
  createSession,
  getSessions,
  getSessionById,
  enrollInSession,
  startSession,
  endSession,
} from '../controllers/session.controller';
import {
  getSessionAnalytics,
  getStudentTimeSeries,
} from '../controllers/analytics.controller';
import { protect, requireRole } from '../middleware/auth.middleware';


const router = Router();

/** All session routes require authentication */
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Sessions
 *   description: Learning session lifecycle management
 */

/**
 * @swagger
 * /api/sessions:
 *   get:
 *     summary: List sessions (role-filtered)
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Array of sessions
 */
router.get('/', getSessions);

/**
 * @swagger
 * /api/sessions:
 *   post:
 *     summary: Create a new session (instructor only)
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, startTime]
 *             properties:
 *               title:           { type: string }
 *               description:     { type: string }
 *               startTime:       { type: string, format: date-time }
 *               durationMinutes: { type: number, default: 60 }
 *     responses:
 *       201:
 *         description: Session created
 *       403:
 *         description: Instructor role required
 */
router.post('/', requireRole('instructor', 'admin'), createSession);

/**
 * @swagger
 * /api/sessions/{id}:
 *   get:
 *     summary: Get session by ID
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session detail
 *       404:
 *         description: Not found
 */
/**
 * @swagger
 * /api/sessions/{id}/analytics:
 *   get:
 *     summary: Get engagement analytics for a completed session
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Analytics payload (timeSeries + students)
 *       404:
 *         description: Session not found
 */
router.get('/:sessionId/analytics', getSessionAnalytics);

/**
 * @swagger
 * /api/sessions/{id}/analytics/student/{studentId}:
 *   get:
 *     summary: Get per-student engagement time series (instructor only)
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Time-series array for the student
 *       403:
 *         description: Instructor access required
 */
router.get('/:sessionId/analytics/student/:studentId', getStudentTimeSeries);

router.get('/:id', getSessionById);

/**
 * @swagger
 * /api/sessions/{id}/enroll:
 *   post:
 *     summary: Enroll the authenticated student in a session
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Enrolled successfully
 *       400:
 *         description: Already enrolled or session not enrollable
 */
router.post('/:id/enroll', requireRole('student'), enrollInSession);

/**
 * @swagger
 * /api/sessions/{id}/start:
 *   patch:
 *     summary: Start a session — generates roomCode (instructor only)
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session started — returns roomCode
 *       403:
 *         description: Not the session's instructor
 */
router.patch('/:id/start', requireRole('instructor', 'admin'), startSession);

/**
 * @swagger
 * /api/sessions/{id}/end:
 *   patch:
 *     summary: End an active session (instructor only)
 *     tags: [Sessions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session ended
 *       403:
 *         description: Not the session's instructor
 */
router.patch('/:id/end', requireRole('instructor', 'admin'), endSession);

export default router;
