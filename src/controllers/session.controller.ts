/**
 * @file session.controller.ts
 * @description Handles CRUD operations and lifecycle management for learning
 *              sessions. Includes creating, listing, enrolling, starting
 *              (which generates a room code), and ending sessions.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import Session, { SessionStatus } from '../models/Session';
import Room from '../models/Room';

/**
 * @description Generates a unique, human-readable room code in the format
 *              "ABC-XYZ-123" using random uppercase letters and digits.
 * @returns {string} A random 11-character room code
 */
const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seg = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${seg(3)}-${seg(3)}-${seg(3)}`;
};

/**
 * @description Creates a new learning session. Only instructors can call this.
 * @param req - Request body: { title, description, startTime, durationMinutes }
 * @param res - Response: { success, session }
 * @throws {400} If required fields are missing
 */
export const createSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, startTime, durationMinutes } = req.body as {
      title: string; description?: string; startTime: string; durationMinutes?: number;
    };

    if (!title || !startTime) {
      res.status(400).json({ success: false, message: 'title and startTime are required' });
      return;
    }

    const session = await Session.create({
      title,
      description:     description || '',
      instructor:      req.user!.id,
      startTime:       new Date(startTime),
      durationMinutes: durationMinutes || 60,
    });

    res.status(201).json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create session' });
  }
};

/**
 * @description Lists sessions based on the caller's role.
 *              Instructors see their own sessions.
 *              Students see all scheduled/active sessions plus their enrollments.
 * @param req - Request with req.user populated
 * @param res - Response: { success, sessions }
 */
export const getSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: userId, role } = req.user!;

    let sessions;
    if (role === 'instructor' || role === 'admin') {
      sessions = await Session.find({ instructor: userId })
        .populate('instructor', 'name email avatarColor')
        .sort({ createdAt: -1 });
    } else {
      // Students see all non-expired sessions
      sessions = await Session.find({ status: { $ne: SessionStatus.EXPIRED } })
        .populate('instructor', 'name email avatarColor')
        .sort({ createdAt: -1 });
    }

    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
  }
};

/**
 * @description Returns full details of a single session by ID.
 * @param req - Request params: { id }
 * @param res - Response: { success, session }
 * @throws {404} If session not found
 */
export const getSessionById = async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await Session.findById(req.params.id)
      .populate('instructor', 'name email avatarColor')
      .populate('enrolledStudents', 'name email avatarColor');

    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch session' });
  }
};

/**
 * @description Enrolls the authenticated student in a session.
 *              Prevents duplicate enrollments.
 * @param req - Request params: { id } (session ID)
 * @param res - Response: { success, message }
 * @throws {404} If session not found
 * @throws {400} If already enrolled or session is not enrollable
 */
export const enrollInSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.EXPIRED) {
      res.status(400).json({ success: false, message: 'Cannot enroll in a completed or expired session' });
      return;
    }

    const alreadyEnrolled = session.enrolledStudents.some(
      (s) => s.toString() === req.user!.id
    );
    if (alreadyEnrolled) {
      res.status(400).json({ success: false, message: 'Already enrolled' });
      return;
    }

    session.enrolledStudents.push(req.user!.id as unknown as typeof session.enrolledStudents[0]);
    await session.save();

    res.json({ success: true, message: 'Enrolled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to enroll' });
  }
};

/**
 * @description Starts a session: sets status to 'active', generates a roomCode,
 *              and creates a Room document. Only the session's instructor can call this.
 * @param req - Request params: { id } (session ID)
 * @param res - Response: { success, roomCode }
 * @throws {403} If caller is not the session's instructor
 * @throws {400} If session is not in 'scheduled' status
 */
export const startSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    if (session.instructor.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: 'Only the session instructor can start it' });
      return;
    }

    if (session.status !== SessionStatus.SCHEDULED) {
      res.status(400).json({ success: false, message: `Session is already ${session.status}` });
      return;
    }

    const roomCode = generateRoomCode();
    session.status   = SessionStatus.ACTIVE;
    session.roomCode = roomCode;
    await session.save();

    await Room.create({ session: session._id, roomCode });

    res.json({ success: true, roomCode });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to start session' });
  }
};

/**
 * @description Ends an active session: sets status to 'completed' and
 *              records the end time. Only the instructor can call this.
 * @param req - Request params: { id } (session ID)
 * @param res - Response: { success, message }
 * @throws {403} If caller is not the session's instructor
 * @throws {400} If session is not currently active
 */
export const endSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    if (session.instructor.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: 'Only the session instructor can end it' });
      return;
    }

    if (session.status !== SessionStatus.ACTIVE) {
      res.status(400).json({ success: false, message: 'Session is not active' });
      return;
    }

    session.status  = SessionStatus.COMPLETED;
    session.endTime = new Date();
    await session.save();

    await Room.findOneAndUpdate({ session: session._id }, { endedAt: new Date() });

    res.json({ success: true, message: 'Session ended' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to end session' });
  }
};
