/**
 * @file analytics.controller.ts
 * @description REST handlers for Phase 2.1 and Phase 2.5 session analytics.
 *
 *              Endpoints:
 *               1. GET /api/sessions/:sessionId/analytics
 *               2. GET /api/sessions/:sessionId/analytics/student/:studentId
 *               3. GET /api/sessions/:sessionId/analytics/heatmap  (Phase 2.5)
 */

// (Original file-level JSDoc below is intentionally replaced by the above)
/**
 * @file analytics.controller.ts
 * @description REST handlers for Phase 2.1 session analytics.
 *
 *              Two endpoints:
 *               1. GET /api/sessions/:sessionId/analytics
 *                  Returns session metadata, 1-minute-bucketed class time series,
 *                  and per-student aggregate stats for the summary table.
 *
 *               2. GET /api/sessions/:sessionId/analytics/student/:studentId
 *                  Returns the 1-minute time series for a single student.
 *                  Called lazily when the instructor clicks a row in the table.
 *
 *              LOCF (Last Observation Carried Forward):
 *                  The skip-very_high storage optimisation means 'very_high'
 *                  periods have no DB records. Post-processing fills empty
 *                  minute buckets with score=0.85 when the last known label
 *                  was 'very_high'.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Session         from '../models/Session';
import EngagementRecord from '../models/EngagementRecord';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Numeric score assigned to each label (mirrors client-side ENGAGEMENT_SCORE map) */
const LABEL_SCORE: Record<string, number> = {
  very_high: 0.85,
  high:      0.60,
  low:       0.35,
  very_low:  0.10,
};

/**
 * @description Maps a numeric score to an engagement label (same thresholds as
 *              the client-side EngagementDashboard compute average).
 * @param score - Weighted average score (0.0 – 1.0)
 * @returns {string} Engagement label
 */
const scoreToLabel = (score: number): string => {
  if (score >= 0.72) return 'very_high';
  if (score >= 0.47) return 'high';
  if (score >= 0.22) return 'low';
  return 'very_low';
};

// ── GET /api/sessions/:sessionId/analytics ────────────────────────────────────

/**
 * @description Returns the full analytics payload for a completed session:
 *              - sessionInfo: metadata about the session
 *              - timeSeries:  1-minute bucketed class average engagement scores
 *              - students:    per-student aggregate stats sorted by avg score desc
 *
 *              Access control:
 *              - Instructors see all student data
 *              - Students see sessionInfo + timeSeries only (no student list)
 *
 * @param req.params.sessionId - MongoDB ObjectId of the session
 * @returns {200} Analytics payload
 * @returns {403} If user is not enrolled or is not the instructor
 * @returns {404} If session not found
 */
export const getSessionAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const sessionIdStr  = sessionId as string;
    const userId        = (req as any).user._id as string;
    const userRole      = (req as any).user.role as string;
    const isInstructor  = userRole === 'instructor' || userRole === 'admin';

    if (!mongoose.Types.ObjectId.isValid(sessionIdStr)) {
      res.status(400).json({ success: false, message: 'Invalid session ID' });
      return;
    }

    const session = await Session.findById(sessionIdStr)
      .populate('instructor', 'name email')
      .lean();

    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    // ── 1. Class time-series (1-minute buckets across ALL students) ─────────────

    const rawTimeSeries = await EngagementRecord.aggregate([
      { $match: { session: new mongoose.Types.ObjectId(sessionIdStr) } },
      {
        // Step 1: bucket each record into its 1-minute window
        $group: {
          _id: {
            student:  '$student',
            // truncate timestamp to the minute
            minute: {
              $dateToString: {
                format: '%Y-%m-%dT%H:%M:00.000Z',
                date:   '$timestamp',
              },
            },
          },
          // Average confidence score within this (student, minute) bucket
          avgScore:       { $avg: '$confidenceScore' },
          dominantLabel: { $last:  '$engagementLevel' },
        },
      },
      {
        // Step 2: average across students within each minute
        $group: {
          _id:           '$_id.minute',
          classAvgScore: { $avg: '$avgScore' },
          studentCount:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Calculate minute offset from session start
    const sessionStart = new Date(session.startTime).getTime();

    const timeSeries = rawTimeSeries.map((point) => ({
      minute:        point._id as string,
      minuteOffset:  Math.round((new Date(point._id as string).getTime() - sessionStart) / 60000),
      classAvgScore: parseFloat((point.classAvgScore as number).toFixed(3)),
      studentCount:  point.studentCount as number,
    }));

    // ── 2. Per-student aggregates (instructor only) ─────────────────────────────

    if (!isInstructor) {
      // Students get session info + class time series only
      res.json({
        success: true,
        sessionInfo: buildSessionInfo(session),
        timeSeries,
        students: [],
      });
      return;
    }

    const rawStudents = await EngagementRecord.aggregate([
      { $match: { session: new mongoose.Types.ObjectId(sessionIdStr) } },
      {
        $group: {
          _id:         '$student',
          avgScore:    { $avg: '$confidenceScore' },
          recordCount: { $sum: 1 },
          very_high:   { $sum: { $cond: [{ $eq: ['$engagementLevel', 'very_high'] }, 1, 0] } },
          high:        { $sum: { $cond: [{ $eq: ['$engagementLevel', 'high']      }, 1, 0] } },
          low:         { $sum: { $cond: [{ $eq: ['$engagementLevel', 'low']       }, 1, 0] } },
          very_low:    { $sum: { $cond: [{ $eq: ['$engagementLevel', 'very_low']  }, 1, 0] } },
        },
      },
      {
        $lookup: {
          from:         'users',
          localField:   '_id',
          foreignField: '_id',
          as:           'userInfo',
        },
      },
      { $sort: { avgScore: -1 } },
    ]);

    // Post-process: apply LOCF to avgScore for students who had many very_high gaps.
    // A student with lots of very_high skips will have a lower recorded avgScore than
    // their true engagement. We estimate their true score by weighting the skip count.
    const students = rawStudents.map((s) => {
      const name     = (s.userInfo as any[])[0]?.name ?? 'Unknown';
      const rawScore = s.avgScore as number;
      const total    = (s.recordCount as number) +
                       (s.very_high as number);   // add back estimated very_high count
      // LOCF-adjusted score: weigh recorded score with an assumed 0.85 for skipped records
      const skippedVH = s.very_high as number;
      const recorded  = s.recordCount as number;
      const adjScore  = skippedVH > 0
        ? (rawScore * recorded + 0.85 * skippedVH) / (recorded + skippedVH)
        : rawScore;

      return {
        userId:      (s._id as mongoose.Types.ObjectId).toString(),
        name,
        avgScore:    parseFloat(adjScore.toFixed(3)),
        avgLabel:    scoreToLabel(adjScore),
        recordCount: recorded,
        distribution: {
          very_high: s.very_high as number,
          high:      s.high      as number,
          low:       s.low       as number,
          very_low:  s.very_low  as number,
        },
      };
    });

    res.json({
      success: true,
      sessionInfo: buildSessionInfo(session),
      timeSeries,
      students,
    });
  } catch (err) {
    console.error('[Analytics] getSessionAnalytics error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ── GET /api/sessions/:sessionId/analytics/student/:studentId ─────────────────

/**
 * @description Returns the 1-minute engagement time series for a single student
 *              within a session. Called lazily when the instructor clicks a row
 *              in the student table to add their line to the chart.
 *
 *              Access control: instructor only.
 *
 * @param req.params.sessionId  - MongoDB ObjectId of the session
 * @param req.params.studentId  - MongoDB ObjectId of the student
 * @returns {200} { series: Array<{ minuteOffset, avgScore, label }> }
 * @returns {403} If not instructor
 * @returns {404} If no records found
 */
export const getStudentTimeSeries = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, studentId } = req.params;
    const sessionIdStr = sessionId as string;
    const studentIdStr = studentId as string;
    const userRole     = (req as any).user.role as string;
    const isInstructor = userRole === 'instructor' || userRole === 'admin';

    if (!isInstructor) {
      res.status(403).json({ success: false, message: 'Instructor access required' });
      return;
    }

    if (
      !mongoose.Types.ObjectId.isValid(sessionIdStr) ||
      !mongoose.Types.ObjectId.isValid(studentIdStr)
    ) {
      res.status(400).json({ success: false, message: 'Invalid ID' });
      return;
    }

    const session = await Session.findById(sessionIdStr).select('startTime').lean();
    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    const raw = await EngagementRecord.aggregate([
      {
        $match: {
          session: new mongoose.Types.ObjectId(sessionIdStr),
          student: new mongoose.Types.ObjectId(studentIdStr),
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%dT%H:%M:00.000Z',
              date:   '$timestamp',
            },
          },
          avgScore:      { $avg:  '$confidenceScore' },
          dominantLabel: { $last: '$engagementLevel' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const sessionStart = new Date(session.startTime).getTime();

    const series = raw.map((point) => ({
      minute:        point._id as string,
      minuteOffset:  Math.round((new Date(point._id as string).getTime() - sessionStart) / 60000),
      avgScore:      parseFloat((point.avgScore as number).toFixed(3)),
      label:         point.dominantLabel as string,
    }));

    if (series.length === 0) {
      res.status(404).json({ success: false, message: 'No engagement records for this student' });
      return;
    }

    res.json({ success: true, series });
  } catch (err) {
    console.error('[Analytics] getStudentTimeSeries error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ── GET /api/sessions/:sessionId/analytics/heatmap ───────────────────────────

/**
 * @description Returns a sparse student × minute engagement matrix for the
 *              instructor heatmap view.
 *
 *              Each cell contains the average confidence score and dominant
 *              engagement label for that (student, minute) bucket. Minutes
 *              with no records for a given student are omitted (sparse).
 *
 *              Access control: instructor only.
 *
 * @param req.params.sessionId - MongoDB ObjectId of the session
 * @returns {200} { success, minutes: string[], rows: HeatmapRow[] }
 * @returns {403} If not instructor
 * @returns {404} If session not found
 */
export const getHeatmapData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const sessionIdStr  = sessionId as string;
    const userRole      = (req as any).user.role as string;
    const isInstructor  = userRole === 'instructor' || userRole === 'admin';

    if (!isInstructor) {
      res.status(403).json({ success: false, message: 'Instructor access required' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(sessionIdStr)) {
      res.status(400).json({ success: false, message: 'Invalid session ID' });
      return;
    }

    const session = await Session.findById(sessionIdStr).select('startTime').lean();
    if (!session) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    // ── Step 1: group by (student, minute) ──────────────────────────────────
    const raw = await EngagementRecord.aggregate([
      { $match: { session: new mongoose.Types.ObjectId(sessionIdStr) } },
      {
        $group: {
          _id: {
            student: '$student',
            minute: {
              $dateToString: {
                format: '%Y-%m-%dT%H:%M:00.000Z',
                date:   '$timestamp',
              },
            },
          },
          avgScore:      { $avg:  '$confidenceScore' },
          dominantLabel: { $last: '$engagementLevel' },
        },
      },
      // ── Step 2: group by student, collect minute cells into an array ─────
      {
        $group: {
          _id:   '$_id.student',
          cells: {
            $push: {
              minute: '$_id.minute',
              score:  { $round: ['$avgScore', 3] },
              label:  '$dominantLabel',
            },
          },
        },
      },
      // ── Step 3: join user names ──────────────────────────────────────────
      {
        $lookup: {
          from:         'users',
          localField:   '_id',
          foreignField: '_id',
          as:           'userInfo',
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    // ── Collect the full sorted set of minutes across all students ────────
    const minuteSet = new Set<string>();
    raw.forEach((row) => {
      (row.cells as { minute: string }[]).forEach((c) => minuteSet.add(c.minute));
    });
    const minutes = Array.from(minuteSet).sort();

    // ── Build response rows ───────────────────────────────────────────────
    const rows = raw.map((row) => ({
      userId: (row._id as mongoose.Types.ObjectId).toString(),
      name:   (row.userInfo as any[])[0]?.name ?? 'Unknown',
      cells:  (row.cells as { minute: string; score: number; label: string }[]).sort(
        (a, b) => a.minute.localeCompare(b.minute)
      ),
    }));

    res.json({ success: true, minutes, rows });
  } catch (err) {
    console.error('[Analytics] getHeatmapData error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * @description Builds the sessionInfo object for the analytics response.
 * @param session - Populated Session Mongoose document (lean)
 * @returns {object} Serialisable session metadata
 */
const buildSessionInfo = (session: any) => ({
  title:           session.title           as string,
  description:     session.description     as string | undefined,
  instructor:      (session.instructor as any)?.name ?? 'Unknown',
  startTime:       session.startTime       as string,
  endTime:         session.endTime         as string | null,
  durationMinutes: session.durationMinutes as number,
  status:          session.status          as string,
});
