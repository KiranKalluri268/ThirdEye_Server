/**
 * @file roomHandler.ts
 * @description Socket.IO event handler for WebRTC signaling in a classroom room.
 *              The server acts as a pure relay — it never inspects SDP or ICE content.
 *
 *              In-memory room state: Map<roomCode, Map<socketId, PeerInfo>>
 *              For multi-server deployment, replace with Redis adapter.
 *
 *              Events handled (client → server):
 *                join          — adds peer to room, broadcasts peer list
 *                offer         — relays SDP offer to target peer
 *                answer        — relays SDP answer to target peer
 *                ice-candidate — relays ICE candidate to target peer
 *                mute          — broadcasts mute state change
 *                unmute        — broadcasts unmute state change
 *                leave         — removes peer, notifies room
 *                end-session   — instructor ends session, notifies all peers
 */

import { Server, Socket } from 'socket.io';

/** Information stored for each connected peer */
interface PeerInfo {
  socketId:    string;
  userId:      string;
  displayName: string;
  isMuted:     boolean;
  isCamOff:    boolean;
  isHandRaised: boolean;
}

/**
 * In-memory room state.
 * Key: roomCode | Value: Map of socketId → PeerInfo
 */
const rooms = new Map<string, Map<string, PeerInfo>>();

/** Per-room instructor permission state */
interface RoomPermissions { allowUnmute: boolean; allowCamToggle: boolean; }
const roomPermissions = new Map<string, RoomPermissions>();

/**
 * @description Registers all WebRTC signaling event listeners for a connected socket.
 *              Called once per socket connection in the /room namespace.
 * @param io     - The Socket.IO server instance
 * @param socket - The connected client socket
 */
const registerRoomHandlers = (io: Server, socket: Socket): void => {

  /**
   * @description Handles a peer joining a room. Adds them to the in-memory room map,
   *              sends them the current peer list, and notifies existing peers.
   */
  socket.on('join', ({ roomCode, userId, displayName }: {
    roomCode: string; userId: string; displayName: string;
  }) => {
    socket.join(roomCode);

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, new Map());
    }

    const room = rooms.get(roomCode)!;

    // Send the joining peer the list of existing peers
    const existingPeers = Array.from(room.values());
    socket.emit('peers', { peers: existingPeers });

    // Send the joining peer the current room permissions (so students know if mic is locked)
    const perms = roomPermissions.get(roomCode) ?? { allowUnmute: false, allowCamToggle: false };
    socket.emit('permissions-updated', perms);

    // Notify existing peers about the new joiner
    socket.to(roomCode).emit('peer-joined', {
      socketId: socket.id,
      userId,
      displayName,
      isMuted:  false,
      isCamOff: false,
      isHandRaised: false,
    });

    // Add the new peer to the room map
    room.set(socket.id, { socketId: socket.id, userId, displayName, isMuted: false, isCamOff: false, isHandRaised: false });

    // Store roomCode on socket for cleanup on disconnect
    (socket as unknown as Record<string, unknown>)['roomCode'] = roomCode;

    console.log(`[Room] ${displayName} joined ${roomCode} (${room.size} peers)`);
  });

  /**
   * @description Relays a WebRTC SDP offer to a specific target peer.
   */
  socket.on('offer', ({ to, sdp }: { to: string; sdp: object }) => {
    io.to(to).emit('offer', { from: socket.id, sdp });
  });

  /**
   * @description Relays a WebRTC SDP answer to a specific target peer.
   */
  socket.on('answer', ({ to, sdp }: { to: string; sdp: object }) => {
    io.to(to).emit('answer', { from: socket.id, sdp });
  });

  /**
   * @description Relays an ICE candidate to a specific target peer.
   */
  socket.on('ice-candidate', ({ to, candidate }: { to: string; candidate: object }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  /**
   * @description Broadcasts a mute state change to all peers in the room.
   * @param kind - 'audio' or 'video'
   */
  socket.on('mute', ({ roomCode, kind }: { roomCode: string; kind: 'audio' | 'video' }) => {
    const room = rooms.get(roomCode);
    if (room?.has(socket.id)) {
      const peer = room.get(socket.id)!;
      if (kind === 'audio') peer.isMuted  = true;
      if (kind === 'video') peer.isCamOff = true;
    }
    socket.to(roomCode).emit('peer-muted', { socketId: socket.id, kind });
  });

  /**
   * @description Broadcasts an unmute state change to all peers in the room.
   * @param kind - 'audio' or 'video'
   */
  socket.on('unmute', ({ roomCode, kind }: { roomCode: string; kind: 'audio' | 'video' }) => {
    const room = rooms.get(roomCode);
    if (room?.has(socket.id)) {
      const peer = room.get(socket.id)!;
      if (kind === 'audio') peer.isMuted  = false;
      if (kind === 'video') peer.isCamOff = false;
    }
    socket.to(roomCode).emit('peer-unmuted', { socketId: socket.id, kind });
  });

  /**
   * @description Phase 2: relays a student's latest engagement label to all other
   *              peers in the room (primarily the instructor's client).
   *              Called after every successful save-record POST (~every 3 seconds).
   *              This event is ephemeral — no database write occurs here.
   * @param roomCode       - The current room code
   * @param engagementLevel - The student's latest engagement label
   */
  socket.on('engagement-update', ({ roomCode, engagementLevel }: {
    roomCode: string; engagementLevel: string;
  }) => {
    // socket.to() excludes the sender — only other room members receive this
    socket.to(roomCode).emit('peer-engagement', {
      socketId:        socket.id,
      engagementLevel,
    });
  });

  /**
   * @description Broadcasts hand-raised state dynamically targeting the UI.
   */
  socket.on('hand-raised', ({ roomCode }: { roomCode: string }) => {
    const room = rooms.get(roomCode);
    if (room?.has(socket.id)) {
      room.get(socket.id)!.isHandRaised = true;
    }
    socket.to(roomCode).emit('peer-hand-raised', { socketId: socket.id });
  });

  socket.on('hand-lowered', ({ roomCode }: { roomCode: string }) => {
    const room = rooms.get(roomCode);
    if (room?.has(socket.id)) {
      room.get(socket.id)!.isHandRaised = false;
    }
    socket.to(roomCode).emit('peer-hand-lowered', { socketId: socket.id });
  });

  socket.on('set-screen-stream', ({ roomCode, screenStreamId }: { roomCode: string, screenStreamId: string }) => {
    socket.to(roomCode).emit('set-screen-stream', { socketId: socket.id, screenStreamId });
  });

  /**
   * @description Instructor updates class-wide media permissions.
   *              Persists to room state and broadcasts to all room members (incl. instructor).
   */
  socket.on('set-permissions', ({ roomCode, allowUnmute, allowCamToggle }: {
    roomCode: string; allowUnmute: boolean; allowCamToggle: boolean;
  }) => {
    roomPermissions.set(roomCode, { allowUnmute, allowCamToggle });
    io.to(roomCode).emit('permissions-updated', { allowUnmute, allowCamToggle });
    console.log(`[Room] Permissions updated for ${roomCode}: unmute=${allowUnmute} cam=${allowCamToggle}`);
  });

  /**
   * @description Instructor broadcasts a force-mute to ALL peers in the room.
   * @param roomCode - The current room code
   * @param kind     - 'audio' or 'video'
   */
  socket.on('force-mute-all', ({ roomCode, kind }: { roomCode: string; kind: 'audio' | 'video' }) => {
    socket.to(roomCode).emit('instructor-force-mute', { kind });
    console.log(`[Room] Instructor force-muted all: kind=${kind} in ${roomCode}`);
  });

  /**
   * @description Instructor mutes a specific peer by their socket ID.
   * @param roomCode       - The current room code
   * @param targetSocketId - Socket ID of the target student
   * @param kind           - 'audio' or 'video'
   */
  socket.on('force-mute-peer', ({ roomCode, targetSocketId, kind }: {
    roomCode: string; targetSocketId: string; kind: 'audio' | 'video';
  }) => {
    io.to(targetSocketId).emit('instructor-force-mute', { kind });
    console.log(`[Room] Instructor force-muted peer ${targetSocketId}: kind=${kind}`);
  });

  /**
   * @description Instructor-only: ends the session for all participants.
   *              Broadcasts 'session-ended' to every peer in the room then
   *              cleans up the room map entry.
   */
  socket.on('end-session', ({ roomCode }: { roomCode: string }) => {
    io.to(roomCode).emit('session-ended');
    rooms.delete(roomCode);
    roomPermissions.delete(roomCode);
    console.log(`[Room] Session ended: ${roomCode}`);
  });

  /**
   * @description Removes a peer from the room when they disconnect or explicitly leave.
   *              Broadcasts 'peer-left' to remaining peers.
   */
  const handleLeave = () => {
    const roomCode = (socket as unknown as Record<string, unknown>)['roomCode'] as string | undefined;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) rooms.delete(roomCode);
    }

    socket.to(roomCode).emit('peer-left', { socketId: socket.id });
    console.log(`[Room] Peer left: ${socket.id} from ${roomCode}`);
  };

  socket.on('leave', handleLeave);
  socket.on('disconnect', handleLeave);
};

export default registerRoomHandlers;
