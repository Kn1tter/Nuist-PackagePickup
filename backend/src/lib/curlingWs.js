import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { getJwtSecret, jwtAuthErrorMessage } from './jwt.js';
import { touchPresence } from './presence.js';
import {
  createBotRoom,
  createRoom,
  disconnectRoom,
  handleMsg,
  joinRoom,
  leaveRoom,
  listWaitingRooms,
  rejoinRoom,
  stats,
} from './curlingRooms.js';

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

export function attachCurlingWs(_server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  });

  wss.on('connection', (ws) => {
    ws._curlingUser = null;
    ws._curlingRoomId = null;
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
            send(ws, { type: 'error', error: '访客不能进入对战，请注册登录' });
            return;
          }
          const user = await queryOne(
            'SELECT id, student_id, nickname, is_admin FROM users WHERE id = ?',
            [payload.id]
          );
          if (!user) {
            send(ws, { type: 'error', error: '用户不存在' });
            return;
          }
          ws._curlingUser = {
            id: user.id,
            student_id: user.student_id,
            nickname: user.nickname,
            is_admin: isAdminUser(user),
          };
          touchPresence(ws._curlingUser, 'ws');
          send(ws, {
            type: 'authed',
            user: {
              id: user.id,
              nickname: user.nickname,
              is_admin: ws._curlingUser.is_admin,
            },
            stats: stats(),
          });
          return;
        }

        if (!ws._curlingUser) {
          send(ws, { type: 'error', error: '请先登录' });
          return;
        }

        if (msg.type === 'create') {
          leaveRoom(ws);
          createRoom(ws, ws._curlingUser, msg.mode);
          return;
        }
        if (msg.type === 'create_bot') {
          leaveRoom(ws);
          createBotRoom(ws, ws._curlingUser, msg.difficulty);
          return;
        }
        if (msg.type === 'join') {
          leaveRoom(ws);
          joinRoom(ws, ws._curlingUser, msg.roomId);
          return;
        }
        if (msg.type === 'rejoin') {
          rejoinRoom(ws, ws._curlingUser, msg.roomId);
          return;
        }
        if (msg.type === 'leave') {
          leaveRoom(ws);
          send(ws, { type: 'left' });
          return;
        }
        if (msg.type === 'list') {
          send(ws, { type: 'list', rooms: listWaitingRooms() });
          return;
        }

        handleMsg(ws, ws._curlingUser, msg);
      } catch (e) {
        console.error('[curling-ws]', e);
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
