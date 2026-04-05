/**
 * @file Room.ts
 * @description Mongoose model for an active classroom room. A Room is created
 *              when an instructor starts a session and is tied 1:1 to a Session.
 *              The roomCode is used as the WebSocket room identifier.
 */

import mongoose, { Document, Schema, Types } from 'mongoose';

/** TypeScript interface representing a Room document */
export interface IRoom extends Document {
  session:   Types.ObjectId;
  roomCode:  string;
  isLocked:  boolean;
  createdAt: Date;
  /** Set when the instructor ends the session */
  endedAt:   Date | null;
}

const RoomSchema = new Schema<IRoom>(
  {
    session:  { type: Schema.Types.ObjectId, ref: 'Session', required: true, unique: true },
    roomCode: { type: String, required: true, unique: true },
    isLocked: { type: Boolean, default: false },
    endedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

RoomSchema.index({ roomCode: 1 });

export default mongoose.model<IRoom>('Room', RoomSchema);
