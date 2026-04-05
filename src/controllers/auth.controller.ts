/**
 * @file auth.controller.ts
 * @description Handles all authentication operations: register, login,
 *              logout, and fetching the current authenticated user.
 *              JWTs are stored in httpOnly cookies (not localStorage).
 */

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

/** Cookie options shared across auth endpoints */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

/**
 * @description Generates a random hex color for the user avatar.
 * @returns {string} A hex color string e.g. '#a78bfa'
 */
const generateAvatarColor = (): string => {
  const colors = ['#7c6fff', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6'];
  return colors[Math.floor(Math.random() * colors.length)];
};

/**
 * @description Signs a JWT with the user's id and role.
 * @param id   - MongoDB user _id as string
 * @param role - User role string
 * @returns {string} Signed JWT
 */
const signToken = (id: string, role: string): string =>
  jwt.sign({ id, role }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
  });

/**
 * @description Registers a new user. Hashes the password, saves the user
 *              to MongoDB, and sets a signed JWT in an httpOnly cookie.
 * @param req - Request body: { name, email, password, role }
 * @param res - Response: { success, user }
 * @throws {400} If email already exists or required fields are missing
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role } = req.body as {
      name: string; email: string; password: string; role?: string;
    };

    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Name, email and password are required' });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(400).json({ success: false, message: 'Email already registered' });
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    const user: IUser = await User.create({
      name,
      email,
      password:    hashed,
      role:        role || 'student',
      avatarColor: generateAvatarColor(),
    });

    const token = signToken(user._id.toString(), user.role);
    res.cookie('token', token, COOKIE_OPTIONS);

    res.status(201).json({
      success: true,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

/**
 * @description Authenticates a user by email and password. Sets a JWT cookie on success.
 * @param req - Request body: { email, password }
 * @param res - Response: { success, user }
 * @throws {401} If credentials are invalid
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const token = signToken(user._id.toString(), user.role);
    res.cookie('token', token, COOKIE_OPTIONS);

    res.json({
      success: true,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatarColor: user.avatarColor },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

/**
 * @description Returns the currently authenticated user's profile.
 * @param req - Request with req.user populated by auth middleware
 * @param res - Response: { success, user }
 * @throws {404} If user no longer exists in DB
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id).select('-password');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @description Logs the user out by clearing the JWT cookie.
 * @param req - Express request
 * @param res - Response: { success, message }
 */
export const logout = (_req: Request, res: Response): void => {
  res.clearCookie('token', { 
    httpOnly: true, 
    sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
    secure:   process.env.NODE_ENV === 'production'
  });
  res.json({ success: true, message: 'Logged out' });
};
