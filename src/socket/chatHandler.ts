/**
 * @file chatHandler.ts
 * @description Socket.IO event handler for in-session real-time chat.
 *              Persists each message to MongoDB and broadcasts it to all
 *              peers in the room. Chat history is loaded via REST on join.
 *
 *              Events handled (client → server):
 *                send-message — saves to DB, broadcasts to room group
 */

import { Server, Socket } from 'socket.io';
import Room from '../models/Room';
import ChatMessage from '../models/ChatMessage';

/**
 * @description Registers chat event listeners for a connected socket.
 *              Called once per socket connection.
 * @param io     - The Socket.IO server instance (used for broadcasting)
 * @param socket - The connected client socket
 */
const registerChatHandlers = (io: Server, socket: Socket): void => {

  /**
   * @description Handles an incoming chat message. Looks up the Room by
   *              roomCode, persists the message, then broadcasts it to all
   *              sockets in the room including the sender.
   * @param roomCode    - The room identifier
   * @param senderId    - MongoDB user ID of the sender
   * @param senderName  - Display name (denormalized for speed)
   * @param content     - The text content of the message
   */
  socket.on('send-message', async ({
    roomCode,
    senderId,
    senderName,
    content,
  }: {
    roomCode:   string;
    senderId:   string;
    senderName: string;
    content:    string;
  }) => {
    try {
      if (!content?.trim()) return;

      const room = await Room.findOne({ roomCode });
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const message = await ChatMessage.create({
        room:       room._id,
        sender:     senderId,
        senderName: senderName.trim(),
        content:    content.trim(),
        timestamp:  new Date(),
      });

      /** Broadcast to everyone in the room (including sender) */
      io.to(roomCode).emit('message', {
        _id:        message._id,
        senderName: message.senderName,
        senderId:   senderId,
        content:    message.content,
        timestamp:  message.timestamp,
      });
    } catch (error) {
      console.error('[Chat] Failed to save message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
};

export default registerChatHandlers;
