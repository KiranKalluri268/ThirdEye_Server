/**
 * @file index.ts
 * @description Main entry point for the ThirdEye Express server.
 *              Loads environment variables, connects to MongoDB, registers
 *              all REST routes and Swagger docs, initialises Socket.IO,
 *              and starts the HTTP server.
 */

import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';

import connectDB from './config/db';
import swaggerSpec from './config/swagger';
import initSocket from './socket/index';

import authRoutes    from './routes/auth.routes';
import sessionRoutes from './routes/session.routes';
import roomRoutes    from './routes/room.routes';
import adminRoutes   from './routes/admin.routes';

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ── Swagger Docs ──────────────────────────────────────────────────────────────

/**
 * @description Serves the Swagger UI at /api/docs.
 *              Only enabled in non-production environments.
 */
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log(`Swagger docs: http://localhost:${PORT}/api/docs`);
}

// ── REST Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth',     authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/rooms',    roomRoutes);
app.use('/api/admin',    adminRoutes);

/**
 * @description Health check endpoint for deployment monitoring.
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 Handler ───────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── HTTP Server + Socket.IO ───────────────────────────────────────────────────

const httpServer = http.createServer(app);
initSocket(httpServer);

// ── Start ─────────────────────────────────────────────────────────────────────

/**
 * @description Connects to MongoDB then starts the HTTP server.
 *              Socket.IO is already attached to the HTTP server before listen().
 */
const start = async (): Promise<void> => {
  await connectDB();
  httpServer.listen(PORT, () => {
    console.log(`ThirdEye server running on http://localhost:${PORT}`);
  });
};

start();
