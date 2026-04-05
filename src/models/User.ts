/**
 * @file User.ts
 * @description Mongoose model for a ThirdEye user. Supports three roles:
 *              admin, instructor, and student. Passwords are stored as
 *              bcrypt hashes — never in plaintext.
 */

import mongoose, { Document, Schema } from 'mongoose';

/** Role options available for a user */
export type RoleType = 'admin' | 'instructor' | 'student';

/** TypeScript interface representing a User document */
export interface IUser extends Document {
  name:      string;
  email:     string;
  password:  string;
  role:      RoleType;
  /** Initials-based avatar color (hex), generated on register */
  avatarColor: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name:        { type: String, required: true, trim: true },
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:    { type: String, required: true },
    role:        { type: String, enum: ['admin', 'instructor', 'student'], default: 'student' },
    avatarColor: { type: String, default: '#7c6fff' },
  },
  { timestamps: true }
);

/** Index on email for fast auth lookups */
UserSchema.index({ email: 1 });

export default mongoose.model<IUser>('User', UserSchema);
