/**
 * @file room.routes.ts
 * @description Express router for room-level endpoints.
 *              All routes are prefixed with /api/rooms and require authentication.
 */

import { Router } from 'express';
import { getRoomByCode, saveEngagementRecord, getChatHistory } from '../controllers/room.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Rooms
 *   description: Classroom room access and engagement data
 */

/**
 * @swagger
 * /api/rooms/{roomCode}:
 *   get:
 *     summary: Get room metadata by room code
 *     tags: [Rooms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: roomCode
 *         required: true
 *         schema: { type: string, example: ABC-XYZ-123 }
 *     responses:
 *       200:
 *         description: Room and session metadata
 *       404:
 *         description: Room not found
 */
router.get('/:roomCode', getRoomByCode);

/**
 * @swagger
 * /api/rooms/{roomCode}/save-record:
 *   post:
 *     summary: Save a client-side engagement inference result (Phase 2)
 *     tags: [Rooms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: roomCode
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [engagementLevel]
 *             properties:
 *               engagementLevel: { type: string, enum: [very_low, low, high, very_high] }
 *               confidenceScore: { type: number }
 *               modelUsed:       { type: string, default: client_mediapipe }
 *               faceStats:       { type: object }
 *     responses:
 *       200:
 *         description: Record saved
 *       400:
 *         description: Invalid level or session not active
 */
router.post('/:roomCode/save-record', saveEngagementRecord);

/**
 * @swagger
 * /api/rooms/{roomCode}/chat-history:
 *   get:
 *     summary: Get last 50 chat messages for a room
 *     tags: [Rooms]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: roomCode
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of chat messages (chronological)
 */
router.get('/:roomCode/chat-history', getChatHistory);

export default router;
