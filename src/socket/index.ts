/**
 * @file index.ts (socket)
 * @description Initialises Socket.IO on the HTTP server and registers
 *              all event handlers (room signaling + chat).
 *              CORS is configured to allow only the CLIENT_URL origin.
 */

import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import registerRoomHandlers from './roomHandler';
import registerChatHandlers from './chatHandler';

/**
 * @description Attaches Socket.IO to the Express HTTP server and registers
 *              all socket event handlers. Call this once in src/index.ts.
 * @param httpServer - The Node.js HTTP server instance wrapping Express
 * @returns {Server} The configured Socket.IO server instance
 */
const initSocket = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin:      process.env.CLIENT_URL || 'http://localhost:5173',
      methods:     ['GET', 'POST'],
      credentials: true,
    },
  });

  /**
   * Register handlers for every new client connection.
   * Each socket gets both room (WebRTC signaling) and chat handlers.
   */
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    registerRoomHandlers(io, socket);
    registerChatHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export default initSocket;
