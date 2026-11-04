import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { getJwtSecret, jwtAuthErrorMessage } from './jwt.js';
import { touchPresence } from './presence.js';
import {
  createBotRoom,
  createRoom,
  createTestRoom,
  disconnectRoom,
  handleMsg,
  joinRoom,
  leaveRoom,
  listWaitingRooms,
  rejoinRoom,
  stats,
} from './tankRooms.js';

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

export function attachTankWs(_server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 32 * 1024,
    perMessageDeflate: false,
  });

  wss.on('connection', (ws) => {
    ws._tankUser = null;
    ws._tankRoomId = null;
    ws._tankIntentionalLeave = false;
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
          ws._tankUser = {
            id: user.id,
            student_id: user.student_id,
            nickname: user.nickname,
            is_admin: isAdminUser(user),
          };
          touchPresence(ws._tankUser, 'ws');
          send(ws, {
            type: 'authed',
            user: {
              id: user.id,
              nickname: user.nickname,
              is_admin: ws._tankUser.is_admin,
            },
            stats: stats(),
          });
          return;
        }

        if (!ws._tankUser) {
          send(ws, { type: 'error', error: '请先登录' });
          return;
        }

        if (msg.type === 'create') {
          ws._tankIntentionalLeave = true;
          leaveRoom(ws);
          ws._tankIntentionalLeave = false;
          createRoom(ws, ws._tankUser, msg.mode);
          return;
        }
        if (msg.type === 'create_bot') {
          ws._tankIntentionalLeave = true;
          leaveRoom(ws);
          ws._tankIntentionalLeave = false;
          createBotRoom(ws, ws._tankUser, msg.difficulty);
          return;
        }
        if (msg.type === 'create_test') {
          if (!ws._tankUser.is_admin) {
            send(ws, { type: 'error', error: '仅管理员可开启测试模式' });
            return;
          }
          ws._tankIntentionalLeave = true;
          leaveRoom(ws);
          ws._tankIntentionalLeave = false;
          createTestRoom(ws, ws._tankUser, msg.count);
          return;
        }
        if (msg.type === 'join') {
          ws._tankIntentionalLeave = true;
          leaveRoom(ws);
          ws._tankIntentionalLeave = false;
          joinRoom(ws, ws._tankUser, msg.roomId);
          return;
        }
        if (msg.type === 'rejoin') {
          rejoinRoom(ws, ws._tankUser, msg.roomId);
          return;
        }
        if (msg.type === 'leave') {
          ws._tankIntentionalLeave = true;
          leaveRoom(ws);
          send(ws, { type: 'left' });
          return;
        }
        if (msg.type === 'list') {
          send(ws, { type: 'list', rooms: listWaitingRooms() });
          return;
        }

        handleMsg(ws, ws._tankUser, msg);
      } catch (e) {
        console.error('[tank-ws]', e);
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
