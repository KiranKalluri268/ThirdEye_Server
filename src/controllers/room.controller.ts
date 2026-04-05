/**
 * @file room.controller.ts
 * @description Handles room-level operations: fetching room metadata,
 *              saving engagement records (Phase 2), and retrieving chat history.
 */

import { Request, Response } from 'express';
import Room from '../models/Room';
import Session from '../models/Session';
import ChatMessage from '../models/ChatMessage';
import EngagementRecord, { EngagementLevelType } from '../models/EngagementRecord';

/**
 * @description Returns metadata for a room by its room code.
 *              Used by the client to validate access before joining.
 * @param req - Request params: { roomCode }
 * @param res - Response: { success, room, session }
 * @throws {404} If room or session not found
 */
export const getRoomByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const room = await Room.findOne({ roomCode: req.params.roomCode });
    if (!room) {
      res.status(404).json({ success: false, message: 'Room not found' });
      return;
    }

    const session = await Session.findById(room.session)
      .populate('instructor', 'name email avatarColor');

    if (!session) {
      res.status(404).json({ success: false, message: 'Associated session not found' });
      return;
    }

    res.json({ success: true, room, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch room' });
  }
};

/**
 * @description Saves a single engagement record sent from the client's
 *              MediaPipe inference engine. Called every ~3 seconds per student.
 *              This is the primary Phase 2 endpoint.
 * @param req - Request params: { roomCode }
 *              Request body: { engagementLevel, confidenceScore, modelUsed, faceStats }
 * @param res - Response: { success }
 * @throws {404} If room or session not found
 * @throws {400} If engagement level is invalid or student is not enrolled
 */
export const saveEngagementRecord = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roomCode } = req.params;
    const { engagementLevel, confidenceScore, modelUsed, faceStats } = req.body as {
      engagementLevel: EngagementLevelType;
      confidenceScore: number;
      modelUsed:       string;
      faceStats?:      object;
    };

    const validLevels: EngagementLevelType[] = ['very_low', 'low', 'high', 'very_high'];
    if (!validLevels.includes(engagementLevel)) {
      res.status(400).json({ success: false, message: 'Invalid engagement level' });
      return;
    }

    const room = await Room.findOne({ roomCode });
    if (!room) {
      res.status(404).json({ success: false, message: 'Room not found' });
      return;
    }

    const session = await Session.findById(room.session);
    if (!session || session.status !== 'active') {
      res.status(400).json({ success: false, message: 'Session is not active' });
      return;
    }

    const isEnrolled = session.enrolledStudents.some(
      (s) => s.toString() === req.user!.id
    );
    if (!isEnrolled && session.instructor.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: 'Not enrolled in this session' });
      return;
    }

    await EngagementRecord.create({
      session:         session._id,
      student:         req.user!.id,
      engagementLevel,
      confidenceScore: confidenceScore || 0,
      modelUsed:       modelUsed || 'client_mediapipe',
      faceStats:       faceStats || null,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save engagement record' });
  }
};

/**
 * @description Returns the last 50 chat messages for a room in chronological order.
 *              Loaded when a participant first joins, to populate chat history.
 * @param req - Request params: { roomCode }
 * @param res - Response: { success, messages }
 * @throws {404} If room not found
 */
export const getChatHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const room = await Room.findOne({ roomCode: req.params.roomCode });
    if (!room) {
      res.status(404).json({ success: false, message: 'Room not found' });
      return;
    }

    const messages = await ChatMessage.find({ room: room._id })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch chat history' });
  }
};
