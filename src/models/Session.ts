/**
 * @file Session.ts
 * @description Mongoose model for a learning session. A session is created
 *              by an instructor, has enrolled students, and transitions
 *              through statuses: scheduled → active → completed | expired.
 *              A roomCode is set when the instructor starts the session.
 */

import mongoose, { Document, Schema, Types } from 'mongoose';

/** Valid lifecycle states for a session */
export enum SessionStatus {
  SCHEDULED  = 'scheduled',
  ACTIVE     = 'active',
  COMPLETED  = 'completed',
  EXPIRED    = 'expired',
}

/** TypeScript interface representing a Session document */
export interface ISession extends Document {
  title:            string;
  description:      string;
  instructor:       Types.ObjectId;
  enrolledStudents: Types.ObjectId[];
  startTime:        Date;
  durationMinutes:  number;
  endTime:          Date | null;
  status:           SessionStatus;
  /** Unique room code set when session becomes active */
  roomCode:         string | null;
  createdAt:        Date;
  updatedAt:        Date;
}

const SessionSchema = new Schema<ISession>(
  {
    title:            { type: String, required: true, trim: true },
    description:      { type: String, default: '' },
    instructor:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    enrolledStudents: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    startTime:        { type: Date, required: true },
    durationMinutes:  { type: Number, default: 60 },
    endTime:          { type: Date, default: null },
    status:           {
      type:    String,
      enum:    Object.values(SessionStatus),
      default: SessionStatus.SCHEDULED,
    },
    roomCode: { type: String, default: null, sparse: true },
  },
  { timestamps: true }
);

/** Indexes for common query patterns */
SessionSchema.index({ instructor: 1, status: 1 });
SessionSchema.index({ roomCode: 1 }, { sparse: true });

export default mongoose.model<ISession>('Session', SessionSchema);
