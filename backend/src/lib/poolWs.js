import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/index.js';
import { getJwtSecret, jwtAuthErrorMessage } from './jwt.js';
import { touchPresence } from './presence.js';
import {
  createBotRoom,
  createRoom,
  disconnectRoom,
  handleGameMsg,
  joinRoom,
  leaveRoom,
  listWaitingRooms,
  rejoinRoom,
  startBotRoom,
  stats,
} from './poolRooms.js';

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

/** noServer: true — share HTTP upgrade with other game WS (see app.js) */
export function attachPoolWs(_server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 32 * 1024,
    perMessageDeflate: false,
  });

  wss.on('connection', (ws) => {
    ws._poolUser = null;
    ws._poolRoomId = null;
    ws._poolIntentionalLeave = false;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      try {
        if (msg.type === 'auth') {
          const token = String(msg.token || '');
          if (!token) {
            send(ws, { type: 'error', error: '请先登录' });
            return;
          }
          let payload;
          try {
            payload = jwt.verify(token, getJwtSecret());
          } catch (err) {
            send(ws, { type: 'error', error: jwtAuthErrorMessage(err) });
            return;
          }
          if (payload.is_guest || payload.id === -1) {
            send(ws, { type: 'error', error: '访客不能进入对战，请注册登录' });
            return;
          }
          const user = await queryOne(
            'SELECT id, student_id, nickname FROM users WHERE id = ?',
            [payload.id]
          );
          if (!user) {
            send(ws, { type: 'error', error: '用户不存在' });
            return;
          }
          ws._poolUser = user;
          touchPresence(user, 'ws');
          send(ws, {
            type: 'authed',
            user: { id: user.id, nickname: user.nickname },
            stats: stats(),
          });
          return;
        }

        if (!ws._poolUser) {
          send(ws, { type: 'error', error: '请先登录' });
          return;
        }

        if (msg.type === 'create') {
          ws._poolIntentionalLeave = true;
          leaveRoom(ws);
          ws._poolIntentionalLeave = false;
          createRoom(ws, ws._poolUser);
          return;
        }
        if (msg.type === 'create_bot') {
          ws._poolIntentionalLeave = true;
          leaveRoom(ws);
          ws._poolIntentionalLeave = false;
          createBotRoom(ws, ws._poolUser, msg.difficulty);
          return;
        }
        if (msg.type === 'start') {
          startBotRoom(ws, ws._poolUser);
          return;
        }
        if (msg.type === 'join') {
          ws._poolIntentionalLeave = true;
          leaveRoom(ws);
          ws._poolIntentionalLeave = false;
          joinRoom(ws, ws._poolUser, msg.roomId);
          return;
        }
        if (msg.type === 'rejoin') {
          rejoinRoom(ws, ws._poolUser, msg.roomId);
          return;
        }
        if (msg.type === 'leave') {
          ws._poolIntentionalLeave = true;
          leaveRoom(ws);
          send(ws, { type: 'left' });
          return;
        }
        if (msg.type === 'list') {
          send(ws, { type: 'list', rooms: listWaitingRooms() });
          return;
        }
        if (['aim', 'frame', 'shot', 'settle', 'cue_place', 'chat'].includes(msg.type)) {
          handleGameMsg(ws, msg);
        }
      } catch (e) {
        console.error('[pool-ws]', e);
        send(ws, { type: 'error', error: e.message || '出错了' });
      }
    });

    ws.on('close', () => disconnectRoom(ws));
    ws.on('error', () => disconnectRoom(ws));
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!client.isAlive) {
        disconnectRoom(client);
        client.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {
        /* ignore */
      }
    }
  }, 30000);
  heartbeat.unref?.();

  return wss;
}
