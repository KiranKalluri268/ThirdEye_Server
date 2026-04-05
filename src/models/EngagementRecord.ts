/**
 * @file EngagementRecord.ts
 * @description Mongoose model for a single student engagement measurement.
 *              Records are created by the client (Phase 2) via POST /api/rooms/:roomCode/save-record.
 *              The model mirrors the Django EngagementRecord from the original engagement_project.
 */

import mongoose, { Document, Schema, Types } from 'mongoose';

/** Possible engagement classification labels */
export type EngagementLevelType = 'very_low' | 'low' | 'high' | 'very_high';

/** Face statistics captured alongside the engagement prediction */
export interface IFaceStats {
  faceDetected:  boolean;
  eyesDetected:  number;
  faceCentered:  boolean;
  score:         number;
  earAvg:        number;
}

/** TypeScript interface representing an EngagementRecord document */
export interface IEngagementRecord extends Document {
  session:         Types.ObjectId;
  student:         Types.ObjectId;
  engagementLevel: EngagementLevelType;
  confidenceScore: number;
  /** Model identifier — 'client_mediapipe' for Phase 2 inference */
  modelUsed:       string;
  faceStats:       IFaceStats | null;
  timestamp:       Date;
}

const EngagementRecordSchema = new Schema<IEngagementRecord>({
  session:         { type: Schema.Types.ObjectId, ref: 'Session', required: true },
  student:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  engagementLevel: {
    type:     String,
    enum:     ['very_low', 'low', 'high', 'very_high'],
    required: true,
  },
  confidenceScore: { type: Number, default: 0 },
  modelUsed:       { type: String, default: 'client_mediapipe' },
  faceStats:       { type: Schema.Types.Mixed, default: null },
  timestamp:       { type: Date, default: Date.now },
});

/** Indexes for analytics queries in Phase 3 */
EngagementRecordSchema.index({ session: 1, timestamp: 1 });
EngagementRecordSchema.index({ student: 1, session: 1 });

export default mongoose.model<IEngagementRecord>('EngagementRecord', EngagementRecordSchema);
