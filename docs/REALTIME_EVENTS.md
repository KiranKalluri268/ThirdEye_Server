# ThirdEye Real-time Events

ThirdEye uses the default Socket.IO namespace on the same HTTP server as Express. These event names and payloads form a shared client/server contract.

The client opens one credentialed connection, then emits `join`. Server handlers generally do not use acknowledgement callbacks. Chat failures may arrive through the generic `error` event.

## Client-to-server events

| Event | Payload | Server behavior |
| --- | --- | --- |
| `join` | `{ roomCode, userId, displayName }` | Join group, return peers/permissions, notify peers, and auto-enroll a non-instructor. |
| `offer` | `{ to, sdp }` | Relay SDP offer to target. |
| `answer` | `{ to, sdp }` | Relay SDP answer to target. |
| `ice-candidate` | `{ to, candidate }` | Relay ICE candidate to target. |
| `mute` | `{ roomCode, kind }` | Store and broadcast muted/camera-off state. |
| `unmute` | `{ roomCode, kind }` | Store and broadcast enabled state. |
| `hand-raised` | `{ roomCode }` | Store and broadcast raised-hand state. |
| `hand-lowered` | `{ roomCode }` | Clear and broadcast raised-hand state. |
| `set-screen-stream` | `{ roomCode, screenStreamId }` | Announce the sender's screen MediaStream ID. |
| `engagement-update` | `{ roomCode, engagementLevel }` | Broadcast ephemeral label to other room members. |
| `send-message` | `{ roomCode, senderId, senderName, content }` | Trim, persist, and broadcast non-empty chat content. |
| `set-permissions` | `{ roomCode, allowUnmute, allowCamToggle }` | Replace and broadcast room permissions. |
| `force-mute-all` | `{ roomCode, kind }` | Tell every other room member to disable a track. |
| `force-mute-peer` | `{ roomCode, targetSocketId, kind }` | Tell one socket to disable a track. |
| `force-unmute-all` | `{ roomCode, kind }` | Tell every other room member to enable a track. |
| `force-unmute-peer` | `{ roomCode, targetSocketId, kind }` | Tell one socket to enable a track. |
| `end-session` | `{ roomCode }` | Broadcast termination and clear in-memory room state. |
| `leave` | `{ roomCode }` | Run leave cleanup using the room stored on the socket. |

For media events, `kind` is `audio` or `video`. Valid engagement levels are `very_low`, `low`, `high`, and `very_high`.

## Server-to-client events

| Event | Payload | Recipients / behavior |
| --- | --- | --- |
| `peers` | `{ peers: PeerInfo[] }` | Joining socket; current peer snapshot. |
| `permissions-updated` | `{ allowUnmute, allowCamToggle }` | Joining socket or entire room after a change. |
| `peer-joined` | `PeerInfo` | Existing peers; add participant. |
| `offer` | `{ from, sdp, displayName }` | Target; begin negotiation. |
| `answer` | `{ from, sdp }` | Target; complete negotiation. |
| `ice-candidate` | `{ from, candidate }` | Target; add remote ICE candidate. |
| `peer-muted` | `{ socketId, kind }` | Other members; update media state. |
| `peer-unmuted` | `{ socketId, kind }` | Other members; update media state. |
| `peer-hand-raised` | `{ socketId }` | Other members; show raised hand. |
| `peer-hand-lowered` | `{ socketId }` | Other members; clear raised hand. |
| `set-screen-stream` | `{ socketId, screenStreamId }` | Other members; associate incoming screen media. |
| `peer-engagement` | `{ socketId, engagementLevel }` | Other members, primarily instructor dashboard. |
| `message` | `{ _id, senderId, senderName, content, timestamp }` | Entire room, including sender. |
| `instructor-force-mute` | `{ kind }` | Selected socket(s); disable local track. |
| `instructor-force-unmute` | `{ kind }` | Selected socket(s); enable local track. |
| `session-ended` | no payload | Entire room; exit classroom. |
| `peer-left` | `{ socketId }` | Remaining members after leave/disconnect. |
| `error` | `{ message }` | Originating socket after chat lookup/write failure. |

```ts
interface PeerInfo {
  socketId: string;
  userId: string;
  displayName: string;
  isMuted: boolean;
  isCamOff: boolean;
  isHandRaised: boolean;
}
```

## Delivery and persistence semantics

- `socket.to(roomCode)` excludes the sender; `io.to(roomCode)` includes it.
- Events have Socket.IO's normal connected-delivery behavior; there is no application retry, replay, sequence number, or acknowledgement layer.
- Peer and permission state is process-local and disappears on restart.
- `end-session` affects live state only. The client separately calls `PATCH /api/sessions/:id/end` for durable completion.
- Chat history is loaded over `GET /api/rooms/:roomCode/chat-history`; only new messages are broadcast.
- Engagement samples are persisted over `POST /api/rooms/:roomCode/save-record`; `engagement-update` is ephemeral.
- Disconnect triggers the same leave cleanup as `leave`. Explicit leave followed by disconnect can cause repeat cleanup and potentially duplicate `peer-left` notifications.

## Security boundary

The current Socket.IO implementation does not authenticate the handshake. It trusts `userId`, `displayName`, room code, sender identity, and instructor-control payloads. Before use with untrusted participants, verify JWTs at connection time, bind identity/role to `socket.data`, validate every payload, authorize room membership and instructor ownership, add rate limits, and derive chat identity from authenticated state.

