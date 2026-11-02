import { WebSocketServer } from 'ws'
import {
  createRoom,
  disconnectRoom,
  ensureAdminRoom,
  handleMsg,
  joinRoom,
  leaveRoom,
  listWaitingRooms,
  stats,
} from './battleTankRooms.js'

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

let guestSeq = 1

function guestUser(name) {
  const clean = String(name || '')
    .trim()
    .slice(0, 12)
    .replace(/[^\w\u4e00-\u9fff\-·]/g, '')
  return {
    id: `g${guestSeq++}_${Date.now().toString(36)}`,
    name: clean || `车手${guestSeq}`,
  }
}

/**
 * Classic tank-battle maze multiplayer WS.
 * Auth is nickname-based (no login required) so two browsers can play quickly.
 */
export function attachBattleTankWs(_server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    perMessageDeflate: false,
  })

  wss.on('connection', (ws) => {
    ws._btUser = null
    ws._btRoomId = null
    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return

      try {
        if (msg.type === 'hello' || msg.type === 'auth') {
          ws._btUser = guestUser(msg.name || msg.nickname)
          send(ws, {
            type: 'authed',
            user: { id: ws._btUser.id, name: ws._btUser.name },
            stats: stats(),
            rooms: listWaitingRooms(),
          })
          return
        }

        if (!ws._btUser) {
          send(ws, { type: 'error', error: '请先发送昵称 hello' })
          return
        }

        if (msg.type === 'list') {
          send(ws, { type: 'list', rooms: listWaitingRooms(), stats: stats() })
          return
        }
        if (msg.type === 'create') {
          leaveRoom(ws)
          createRoom(ws, ws._btUser, { admin: !!msg.admin, code: msg.code })
          return
        }
        if (msg.type === 'joinAdmin' || (msg.type === 'join' && String(msg.code || msg.roomId || '').toUpperCase() === 'TEST')) {
          leaveRoom(ws)
          ensureAdminRoom(ws, ws._btUser)
          return
        }
        if (msg.type === 'join') {
          leaveRoom(ws)
          joinRoom(ws, ws._btUser, msg.code || msg.roomId)
          return
        }
        if (msg.type === 'leave') {
          leaveRoom(ws)
          send(ws, { type: 'left' })
          return
        }

        handleMsg(ws, ws._btUser, msg)
      } catch (e) {
        send(ws, { type: 'error', error: e.message || '出错了' })
      }
    })

    ws.on('close', () => {
      disconnectRoom(ws)
    })
  })

  const pingTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        try {
          ws.terminate()
        } catch {
          /* ignore */
        }
        continue
      }
      ws.isAlive = false
      try {
        ws.ping()
      } catch {
        /* ignore */
      }
    }
  }, 25000)

  wss.on('close', () => clearInterval(pingTimer))
  return wss
}
