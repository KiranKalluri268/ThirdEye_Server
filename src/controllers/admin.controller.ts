/**
 * @file admin.controller.ts
 * @description Platform-wide analytics for admin users.
 *              Single endpoint returns all stats in one parallel-fetched payload.
 */

import { Request, Response } from 'express';
import mongoose              from 'mongoose';
import User                  from '../models/User';
import Session, { SessionStatus } from '../models/Session';
import EngagementRecord      from '../models/EngagementRecord';
import Room                  from '../models/Room';

/**
 * @description Returns a consolidated platform analytics payload.
 *              All DB queries run in parallel via Promise.all for speed.
 * @route  GET /api/admin/stats
 * @access Admin only
 */
export const getAdminStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      usersByRole,
      recentUsers,
      totalSessions,
      sessionsByStatus,
      recentSessions,
      totalRooms,
      engagementStats,
      topSessions,
    ] = await Promise.all([

      // ── Users ───────────────────────────────────────────────────────────────
      User.countDocuments(),

      User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),

      User.find()
        .select('name email role avatarColor createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // ── Sessions ─────────────────────────────────────────────────────────────
      Session.countDocuments(),

      Session.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      Session.find()
        .populate('instructor', 'name email avatarColor')
        .select('title status startTime durationMinutes roomCode instructor')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      // ── Rooms ────────────────────────────────────────────────────────────────
      Room.countDocuments(),

      // ── Engagement: avg score + label distribution ────────────────────────────
      EngagementRecord.aggregate([
        {
          $group: {
            _id:       null,
            totalRecs: { $sum: 1 },
            avgScore:  { $avg: '$confidenceScore' },
            very_high: { $sum: { $cond: [{ $eq: ['$engagementLevel', 'very_high'] }, 1, 0] } },
            high:      { $sum: { $cond: [{ $eq: ['$engagementLevel', 'high']      }, 1, 0] } },
            low:       { $sum: { $cond: [{ $eq: ['$engagementLevel', 'low']       }, 1, 0] } },
            very_low:  { $sum: { $cond: [{ $eq: ['$engagementLevel', 'very_low']  }, 1, 0] } },
          },
        },
      ]),

      // ── Top sessions by avg engagement score ─────────────────────────────────
      EngagementRecord.aggregate([
        {
          $group: {
            _id:      '$session',
            avgScore: { $avg: '$confidenceScore' },
            records:  { $sum: 1 },
          },
        },
        { $sort: { avgScore: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from:         'sessions',
            localField:   '_id',
            foreignField: '_id',
            as:           'sessionInfo',
          },
        },
      ]),
    ]);

    // ── Shape user role map ─────────────────────────────────────────────────
    const roleMap: Record<string, number> = { admin: 0, instructor: 0, student: 0 };
    (usersByRole as { _id: string; count: number }[]).forEach((r) => {
      roleMap[r._id] = r.count;
    });

    // ── Shape session status map ────────────────────────────────────────────
    const statusMap: Record<string, number> = {
      scheduled: 0, active: 0, completed: 0, expired: 0,
    };
    (sessionsByStatus as { _id: string; count: number }[]).forEach((s) => {
      statusMap[s._id] = s.count;
    });

    const completedCount = statusMap[SessionStatus.COMPLETED] ?? 0;
    const completionRate = totalSessions > 0
      ? parseFloat(((completedCount / totalSessions) * 100).toFixed(1))
      : 0;

    // ── Shape engagement stats ──────────────────────────────────────────────
    const engRaw = (engagementStats as any[])[0] ?? {
      totalRecs: 0, avgScore: 0, very_high: 0, high: 0, low: 0, very_low: 0,
    };
    const totalRecs = engRaw.totalRecs as number;
    const pct = (n: number) =>
      totalRecs > 0 ? parseFloat(((n / totalRecs) * 100).toFixed(1)) : 0;

    // ── Shape top sessions ──────────────────────────────────────────────────
    const topSessionsFormatted = (topSessions as any[]).map((s) => ({
      sessionId: (s._id as mongoose.Types.ObjectId).toString(),
      title:     (s.sessionInfo as any[])[0]?.title ?? 'Unknown',
      avgScore:  parseFloat((s.avgScore as number).toFixed(3)),
      records:   s.records as number,
    }));

    res.json({
      success: true,
      users: {
        total:       totalUsers,
        byRole:      roleMap,
        recentUsers: recentUsers,
      },
      sessions: {
        total:          totalSessions,
        byStatus:       statusMap,
        completionRate,
        recentSessions,
      },
      engagement: {
        totalRecords: totalRecs,
        avgScore:     parseFloat((engRaw.avgScore as number).toFixed(3)),
        byLabel: {
          very_high: { count: engRaw.very_high as number, pct: pct(engRaw.very_high as number) },
          high:      { count: engRaw.high      as number, pct: pct(engRaw.high      as number) },
          low:       { count: engRaw.low       as number, pct: pct(engRaw.low       as number) },
          very_low:  { count: engRaw.very_low  as number, pct: pct(engRaw.very_low  as number) },
        },
        topSessions: topSessionsFormatted,
      },
      rooms: {
        total: totalRooms,
      },
    });
  } catch (err) {
    console.error('[Admin] getAdminStats error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * @description Returns all users sorted by registration date (newest first).
 * @route  GET /api/admin/users
 * @access Admin only
 */
export const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find()
      .select('name email role avatarColor createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, users });
  } catch (err) {
    console.error('[Admin] getAllUsers error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * @description Returns all sessions across every instructor, sorted newest first.
 * @route  GET /api/admin/sessions
 * @access Admin only
 */
export const getAllSessions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await Session.find()
      .populate('instructor', 'name email avatarColor')
      .select('title status startTime durationMinutes roomCode instructor')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, sessions });
  } catch (err) {
    console.error('[Admin] getAllSessions error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

