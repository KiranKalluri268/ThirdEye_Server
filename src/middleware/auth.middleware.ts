/**
 * @file auth.middleware.ts
 * @description Express middleware that validates the JWT stored in the
 *              httpOnly cookie ('token'). Attaches the decoded user payload
 *              to req.user. Rejects unauthenticated requests with 401.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/** Shape of the JWT payload */
export interface JwtPayload {
  id:   string;
  role: string;
}

/** Extend Express Request to include the decoded user */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * @description Verifies the JWT from the httpOnly cookie and attaches
 *              the decoded payload to req.user. Calls next() on success.
 * @param req  - Express request (reads cookie 'token')
 * @param res  - Express response
 * @param next - Next middleware function
 * @returns {void} Sends 401 if token is missing or invalid
 */
const protect = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : undefined);

  if (!token) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

/**
 * @description Role-based access middleware factory. Returns a middleware
 *              function that allows only the specified roles.
 * @param roles - Array of allowed role strings
 * @returns Express middleware that enforces role restriction
 */
const requireRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Forbidden: insufficient role' });
      return;
    }
    next();
  };

export { protect, requireRole };
