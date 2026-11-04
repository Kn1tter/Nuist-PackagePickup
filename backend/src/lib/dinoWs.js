import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/index.js';
import { getJwtSecret, jwtAuthErrorMessage } from './jwt.js';
import { touchPresence } from './presence.js';
import {
  createRoom,
  disconnectRoom,
  handleMsg,
  joinRoom,
  leaveRoom,
  listWaitingRooms,
  rejoinRoom,
  stats,
} from './dinoRooms.js';

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

export function attachDinoWs(_server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    perMessageDeflate: false,
  });

  wss.on('connection', (ws) => {
    ws._dinoUser = null;
    ws._dinoRoomId = null;
    ws._dinoIntentionalLeave = false;
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
          let payload;
          try {
            payload = jwt.verify(token, getJwtSecret());
          } catch (err) {
            send(ws, { type: 'error', error: jwtAuthErrorMessage(err) });
            return;
          }
          if (payload.is_guest || payload.id === -1) {
            send(ws, { type: 'error', error: '访客不能联机，请注册登录' });
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
          ws._dinoUser = user;
          touchPresence(user, 'ws');
          send(ws, {
            type: 'authed',
            user: { id: user.id, nickname: user.nickname },
            stats: stats(),
          });
          return;
        }

        if (!ws._dinoUser) {
          send(ws, { type: 'error', error: '请先登录' });
          return;
        }

        if (msg.type === 'list') {
          send(ws, { type: 'list', rooms: listWaitingRooms() });
          return;
        }
        if (msg.type === 'create') {
          ws._dinoIntentionalLeave = true;
          leaveRoom(ws);
          ws._dinoIntentionalLeave = false;
          createRoom(ws, ws._dinoUser);
          return;
        }
        if (msg.type === 'join') {
          ws._dinoIntentionalLeave = true;
          leaveRoom(ws);
          ws._dinoIntentionalLeave = false;
          joinRoom(ws, ws._dinoUser, msg.roomId || msg.code);
          return;
        }
        if (msg.type === 'rejoin') {
          rejoinRoom(ws, ws._dinoUser, msg.roomId || msg.code);
          return;
        }
        if (msg.type === 'leave') {
          ws._dinoIntentionalLeave = true;
          leaveRoom(ws);
          ws._dinoIntentionalLeave = false;
          send(ws, { type: 'left' });
          return;
        }

        handleMsg(ws, ws._dinoUser, msg);
      } catch (e) {
        send(ws, { type: 'error', error: e.message || '出错了' });
      }
    });

    ws.on('close', () => {
      disconnectRoom(ws);
    });
  });

  const ping = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, 25000);
  wss.on('close', () => clearInterval(ping));

  return wss;
}
