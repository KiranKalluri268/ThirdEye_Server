/**
 * @file ChatMessage.ts
 * @description Mongoose model for in-session chat messages. Messages are
 *              associated with a Room and a sender User. senderName is
 *              denormalized to avoid joins on every read.
 */

import mongoose, { Document, Schema, Types } from 'mongoose';

/** TypeScript interface representing a ChatMessage document */
export interface IChatMessage extends Document {
  room:       Types.ObjectId;
  sender:     Types.ObjectId;
  /** Denormalized sender name for fast reads */
  senderName: string;
  content:    string;
  timestamp:  Date;
}

const ChatMessageSchema = new Schema<IChatMessage>({
  room:       { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  sender:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  content:    { type: String, required: true, trim: true },
  timestamp:  { type: Date, default: Date.now },
});

/** Index for fetching messages by room in chronological order */
ChatMessageSchema.index({ room: 1, timestamp: 1 });

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
