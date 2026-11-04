<template>
  <main class="panel curl-page">
    <header class="head">
      <div>
        <h1>冰壶</h1>
        <p class="muted tip">{{ statusLine }}</p>
      </div>
      <RouterLink class="back" to="/arcade">← 小游戏</RouterLink>
    </header>

    <section v-if="!inRoom" class="lobby">
      <div class="mode-pick">
        <button
          type="button"
          class="mode-btn"
          :class="{ on: createMode === 'duel' }"
          @click="createMode = 'duel'"
        >
          <strong>1v1</strong>
          <span>两人交替投壶 · 4 局</span>
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ on: createMode === 'ffa' }"
          @click="createMode = 'ffa'"
        >
          <strong>混战</strong>
          <span>3–4 人 · 谁离钮近谁得分</span>
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ on: createMode === 'teams' }"
          @click="createMode = 'teams'"
        >
          <strong>2v2</strong>
          <span>红蓝对抗 · 经典计分</span>
        </button>
      </div>
      <div class="row">
        <button type="button" class="btn" :disabled="!ready" @click="createRoom">
          {{
            createMode === 'teams' ? '开 2v2 房间' : createMode === 'ffa' ? '开混战房间' : '开 1v1 房间'
          }}
        </button>
        <button type="button" class="btn ghost" :disabled="!ready" @click="refreshList">刷新</button>
      </div>
      <div class="bot-row">
        <label class="count-lab">
          人机难度
          <select v-model="botDiff">
            <option value="easy">简单</option>
            <option value="normal">普通</option>
            <option value="hard">困难</option>
          </select>
        </label>
        <button type="button" class="btn" :disabled="!ready" @click="createBotRoom">开人机 1v1</button>
      </div>
      <div class="join-row">
        <input v-model="joinCode" maxlength="4" placeholder="房间码" class="code-input" />
        <button type="button" class="btn" :disabled="!ready || joinCode.trim().length < 4" @click="joinRoom()">
          加入
        </button>
      </div>
      <p v-if="savedRoom" class="rejoin-hint">
        未完成对局 <strong>{{ savedRoom }}</strong>
        <button type="button" class="btn sm" :disabled="!ready" @click="tryRejoin(savedRoom)">重连</button>
      </p>
      <p v-if="error" class="err">{{ error }}</p>
      <ul class="room-list">
        <li v-for="r in waiting" :key="r.id">
          <span>
            <em class="mode-tag">{{ r.modeLabel }}</em>
            {{ r.hostName }} · {{ r.id }} · {{ r.count }}/{{ r.max }}
          </span>
          <button type="button" class="btn ghost sm" @click="joinRoom(r.id)">加入</button>
        </li>
        <li v-if="!waiting.length" class="muted">暂无房间 · 可开 1v1 / 混战 / 2v2</li>
      </ul>
      <section class="rules-card">
        <h2>游戏规则</h2>
        <ol>
          <li>从左侧冰道向右侧大本营投壶；可调瞄准高度、角度、力度、旋转（curl）。</li>
          <li>
            <strong>计分</strong>：一局全部投完后，拥有离「钮」（圆心）最近一壶的一方得分；该方每一颗比对方最近壶更近的壶各计
            <strong>1 分</strong>。双方都没有有效壶则为空局 0 分。
          </li>
          <li>
            <strong>有效壶</strong>：须越过红色 hog 线；飞出后挡/两侧边线视为出界，不计分。
          </li>
          <li>
            <strong>1v1</strong>：2 人各投 4 壶，共 4 局，个人累加分高者胜。
          </li>
          <li>
            <strong>混战</strong>：3–4 人各投 2 壶，共 3 局，个人累加分高者胜。
          </li>
          <li>
            <strong>2v2</strong>：红蓝各 2 人、各队共投 4 壶，共 4 局，按队计分，总分高的队胜。
          </li>
          <li>每回合约 55 秒；超时将自动轻推。壶与壶碰撞会改变路线。</li>
        </ol>
      </section>
    </section>

    <section v-else-if="state" class="battle">
      <div class="meta">
        <span>房间 <strong>{{ state.id }}</strong></span>
        <span v-if="state.status === 'playing'">
          第 {{ state.end }}/{{ state.maxEnds }} 局
        </span>
        <span v-if="turnLeftSec != null && state.phase === 'aim'">剩 {{ turnLeftSec }}s</span>
        <button type="button" class="btn ghost sm" @click="leave">离开</button>
      </div>
      <p v-if="state.vsBot" class="test-tag">人机 · {{ state.botDiffLabel || botDiff }}</p>
      <p class="banner">{{ state.message }}</p>
      <p v-if="lastEndFlash" class="end-flash">本局得分：{{ lastEndFlash }}</p>
      <p
        v-else-if="liveScoreText && state.status === 'playing' && state.phase !== 'settle'"
        class="live-score"
        :class="{ lead: (state.liveScore?.points || 0) > 0 }"
      >
        {{ liveScoreText }}
      </p>

      <div
        v-if="state.status === 'playing' || state.status === 'ended' || (state.endLog && state.endLog.length)"
        class="scoreboard"
      >
        <div class="score-head">
          <strong>比分</strong>
          <span class="muted">{{ scoreboardHint }}</span>
        </div>
        <div class="score-totals">
          <template v-if="state.mode === 'teams'">
            <span class="tot red">红队 {{ state.scores?.team0 ?? 0 }}</span>
            <span class="tot-sep">:</span>
            <span class="tot blue">蓝队 {{ state.scores?.team1 ?? 0 }}</span>
          </template>
          <template v-else>
            <span v-for="p in state.players" :key="'tot-' + p.userId" class="tot-pill">
              <i class="dot" :style="{ background: p.color }" />
              {{ p.nickname }} <strong>{{ scoreOf(p) }}</strong>
            </span>
          </template>
        </div>
        <p v-if="liveScoreText && state.status === 'playing' && state.phase !== 'settle'" class="live-inline">
          当前局：<strong>{{ liveScoreShort }}</strong>
        </p>
        <table v-if="state.endLog?.length" class="end-table">
          <thead>
            <tr>
              <th>局</th>
              <th>本局得分</th>
              <th>累计</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in state.endLog"
              :key="'end-' + e.end"
              :class="{ latest: state.lastEnd && e.end === state.lastEnd.end }"
            >
              <td>第 {{ e.end }} 局</td>
              <td>
                <template v-if="e.points > 0">{{ e.who }} +{{ e.points }}</template>
                <template v-else>空局 0</template>
              </td>
              <td class="muted">{{ endTotalsLabel(e) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted score-empty">本局投完后会在此显示得分</p>
      </div>

      <div class="canvas-wrap">
        <canvas ref="canvasEl" width="960" height="480" />
      </div>

      <div class="hud-players">
        <div
          v-for="p in state.players"
          :key="p.userId"
          class="hp-card"
          :class="{
            me: p.isMe,
            turn: state.turnSeat === p.seat && state.status === 'playing',
            red: p.team === 0,
            blue: p.team === 1,
          }"
        >
          <span class="dot" :style="{ background: p.color }" />
          <strong>{{ p.nickname }}</strong>
          <span v-if="p.teamName" class="team-tag">{{ p.teamName }}</span>
          <span class="hp">{{ scoreOf(p) }} 分</span>
          <span v-if="state.stonesLeft" class="left">剩 {{ state.stonesLeft[p.seat] ?? 0 }} 壶</span>
        </div>
      </div>

      <details v-if="state.status === 'lobby' || state.status === 'playing'" class="rules-inline">
        <summary>查看规则</summary>
        <ol>
          <li>向大本营投壶；调高度、角度、力度、旋转。</li>
          <li>离钮最近的一方得分；比对方最近壶更近的每颗 +1 分。</li>
          <li>须过红色 hog 线；出界不计分。</li>
          <li>
            {{
              state.mode === 'teams'
                ? '2v2：按队计分，4 局总分高者胜。'
                : state.mode === 'ffa'
                  ? '混战：每人 2 壶 × 3 局，个人总分高者胜。'
                  : '1v1：每人 4 壶 × 4 局，个人总分高者胜。'
            }}
          </li>
        </ol>
      </details>

      <div v-if="state.status === 'lobby'" class="actions">
        <p class="muted">
          <template v-if="state.vsBot">人机 1v1 · 点开始即可</template>
          <template v-else-if="state.mode === 'teams'">
            2v2 · {{ state.players.length }}/4 · 红蓝各 2 人后开始
          </template>
          <template v-else-if="state.mode === 'ffa'">
            混战 {{ state.players.length }}/{{ state.maxPlayers }}（至少 3 人）
          </template>
          <template v-else>1v1 · {{ state.players.length }}/2</template>
        </p>
        <div v-if="isHost && !state.vsBot" class="row">
          <button
            type="button"
            class="btn ghost sm"
            :class="{ on: state.mode === 'duel' }"
            @click="send({ type: 'set_mode', mode: 'duel' })"
          >
            1v1
          </button>
          <button
            type="button"
            class="btn ghost sm"
            :class="{ on: state.mode === 'ffa' }"
            @click="send({ type: 'set_mode', mode: 'ffa' })"
          >
            混战
          </button>
          <button
            type="button"
            class="btn ghost sm"
            :class="{ on: state.mode === 'teams' }"
            @click="send({ type: 'set_mode', mode: 'teams' })"
          >
            2v2
          </button>
        </div>
        <div v-if="state.mode === 'teams' && !state.vsBot" class="row team-pick">
          <span class="muted">我的队伍</span>
          <button
            type="button"
            class="btn ghost sm"
            :class="{ on: mePlayer?.team === 0 }"
            @click="send({ type: 'set_team', team: 0 })"
          >
            红队
          </button>
          <button
            type="button"
            class="btn ghost sm"
            :class="{ on: mePlayer?.team === 1 }"
            @click="send({ type: 'set_team', team: 1 })"
          >
            蓝队
          </button>
        </div>
        <button v-if="isHost" type="button" class="btn" :disabled="!canStart" @click="send({ type: 'start' })">
          开始游戏
        </button>
        <p v-else class="muted">等待房主开始…</p>
      </div>

      <div v-else-if="isMyTurn && state.phase === 'aim'" class="actions aim">
        <div class="ctrl-row">
          <label>
            瞄准高度 {{ Math.round(aimY) }}
            <input v-model.number="aimY" type="range" :min="iceTop" :max="iceBot" @input="draw" />
          </label>
        </div>
        <div class="ctrl-row">
          <label>
            角度 {{ angle }}°
            <input v-model.number="angle" type="range" min="-18" max="18" @input="draw" />
          </label>
          <label>
            旋转 {{ curl.toFixed(1) }}
            <input v-model.number="curl" type="range" min="-1" max="1" step="0.1" @input="draw" />
          </label>
        </div>
        <div class="ctrl-row power">
          <label>
            力度 {{ power }}
            <input v-model.number="power" type="range" min="3" max="16" step="0.5" />
          </label>
          <button type="button" class="btn fire" :disabled="throwing" @click="doThrow">
            {{ throwing ? '滑行中…' : '投出' }}
          </button>
          <button type="button" class="btn ghost" @click="send({ type: 'skip' })">轻推</button>
        </div>
      </div>

      <div v-else-if="state.status === 'ended'" class="actions">
        <p class="win">{{ state.message }}</p>
        <button type="button" class="btn" @click="leave">返回大厅</button>
      </div>

      <p v-else-if="state.status === 'playing'" class="muted wait">
        {{ state.phase === 'sliding' || throwing ? '冰壶滑行中…' : '等待其他玩家投壶…' }}
      </p>

      <GameChat
        v-if="state.status === 'playing' || state.status === 'ended' || state.status === 'lobby'"
        :messages="chatLog"
        :disabled="state.status === 'ended'"
        @send="sendChat"
      />

      <p v-if="error" class="err">{{ error }}</p>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import GameChat from '../components/GameChat.vue'
import { apiBase, getToken, getUser } from '../api/request'

const ROOM_KEY = 'nuist_curling_room'
const router = useRouter()

const ready = ref(false)
const error = ref('')
const waiting = ref([])
const joinCode = ref('')
const botDiff = ref('normal')
const savedRoom = ref(sessionStorage.getItem(ROOM_KEY) || '')
const state = ref(null)
const inRoom = ref(false)
const chatLog = ref([])
const canvasEl = ref(null)
const createMode = ref('duel')
const angle = ref(0)
const power = ref(12)
const curl = ref(0)
const aimY = ref(240)
const throwing = ref(false)
const turnLeftSec = ref(null)
const iceTop = 50
const iceBot = 430

let ws = null
let intentionalLeave = false
let reconnectTimer = 0
let reconnectAttempts = 0
let tickTimer = 0
let animRaf = 0
let animFrames = null
let animIdx = 0
let displayStones = []

const statusLine = computed(() => {
  if (!ready.value) return '连接中…'
  if (!inRoom.value) return '1v1 · 混战 · 2v2 · 瞄准旋转投壶'
  return state.value?.message || '对局中'
})

const mePlayer = computed(() => state.value?.players?.find((p) => p.isMe) || null)

const isHost = computed(() => mePlayer.value?.seat === 0 || mePlayer.value?.isHost)

const isMyTurn = computed(() => {
  const st = state.value
  if (!st || st.status !== 'playing' || st.phase !== 'aim') return false
  return st.turnSeat === mePlayer.value?.seat
})

const canStart = computed(() => {
  const st = state.value
  if (!st) return false
  if (st.vsBot) return true
  if (st.mode === 'teams') {
    const red = st.players?.filter((p) => p.team === 0).length || 0
    const blue = st.players?.filter((p) => p.team === 1).length || 0
    return st.players?.length === 4 && red === 2 && blue === 2
  }
  if (st.mode === 'ffa') return (st.players?.length || 0) >= 3
  return (st.players?.length || 0) >= 2
})

const lastEndFlash = computed(() => {
  const e = state.value?.lastEnd
  if (!e || state.value?.phase !== 'settle') return ''
  if (e.points > 0) return `${e.who} +${e.points} 分`
  return '空局 0 分'
})

const liveScoreText = computed(() => {
  const ls = state.value?.liveScore
  if (!ls) return ''
  return ls.label || ''
})

const liveScoreShort = computed(() => {
  const ls = state.value?.liveScore
  if (!ls) return '—'
  if (!ls.points) return '暂无人领先（0）'
  return `${ls.who} 领先 ${ls.points} 分`
})

const scoreboardHint = computed(() => {
  const st = state.value
  if (!st) return ''
  if (st.status === 'ended') return '终局'
  if (st.phase === 'settle') return `第 ${st.end} 局结算中`
  return `第 ${st.end || 0}/${st.maxEnds || 0} 局进行中`
})

function scoreOf(p) {
  if (state.value?.mode === 'teams' && state.value.scores) {
    return state.value.scores[`team${p.team}`] ?? 0
  }
  return p.score ?? 0
}

function endTotalsLabel(e) {
  if (!e?.totals) return '—'
  if (state.value?.mode === 'teams') {
    return `红 ${e.totals.team0 ?? 0} : 蓝 ${e.totals.team1 ?? 0}`
  }
  const parts = (state.value?.players || []).map((p) => {
    const n = e.totals[String(p.userId)] ?? 0
    return `${p.nickname} ${n}`
  })
  return parts.join(' · ') || '—'
}

function wsUrl() {
  if (apiBase) {
    const u = new URL(apiBase)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/api/curling/ws'
    return u.toString()
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api/curling/ws`
}

function send(msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg))
}

function sendChat(text) {
  send({ type: 'chat', text })
}

function connect() {
  if (!getUser() || !getToken()) {
    router.replace({ name: 'login', query: { redirect: '/arcade/curling' } })
    return
  }
  error.value = ''
  ws = new WebSocket(wsUrl())
  ws.onopen = () => {
    reconnectAttempts = 0
    send({ type: 'auth', token: getToken() })
  }
  ws.onmessage = (ev) => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    if (msg.type === 'authed') {
      ready.value = true
      refreshList()
      return
    }
    if (msg.type === 'list') {
      waiting.value = msg.rooms || []
      return
    }
    if (msg.type === 'error') {
      error.value = msg.error || '出错了'
      throwing.value = false
      return
    }
    if (msg.type === 'left') {
      inRoom.value = false
      state.value = null
      sessionStorage.removeItem(ROOM_KEY)
      savedRoom.value = ''
      refreshList()
      return
    }
    if (msg.type === 'chat') {
      chatLog.value = [...chatLog.value, msg].slice(-80)
      return
    }
    if (msg.type === 'throw') {
      throwing.value = true
      playThrow(msg.frames, msg.stones)
      if (msg.state) applyState(msg.state)
      else if (state.value) {
        state.value = {
          ...state.value,
          phase: 'sliding',
          stones: msg.stones || state.value.stones,
          liveScore: msg.liveScore || state.value.liveScore,
        }
      }
      return
    }
    if (msg.type === 'end_settle') {
      if (msg.state) applyState(msg.state)
      return
    }
    if (msg.type === 'created' || msg.type === 'joined' || msg.type === 'state' || msg.state) {
      applyState(msg.state)
      return
    }
  }
  ws.onclose = () => {
    ready.value = false
    if (intentionalLeave) return
    const delay = Math.min(8000, 800 * 2 ** reconnectAttempts)
    reconnectAttempts += 1
    reconnectTimer = window.setTimeout(connect, delay)
  }
}

function applyState(st) {
  if (!st) return
  state.value = st
  inRoom.value = true
  sessionStorage.setItem(ROOM_KEY, st.id)
  savedRoom.value = st.id
  if (st.phase !== 'sliding') {
    displayStones = st.stones || []
    throwing.value = false
  }
  nextTick(() => draw())
}

function playThrow(frames, finalStones) {
  cancelAnimationFrame(animRaf)
  animFrames = frames?.length ? frames : null
  animIdx = 0
  if (!animFrames) {
    displayStones = finalStones || []
    throwing.value = false
    draw()
    return
  }
  const step = () => {
    if (!animFrames) return
    if (animIdx >= animFrames.length) {
      displayStones = finalStones || animFrames[animFrames.length - 1] || []
      animFrames = null
      throwing.value = false
      draw()
      return
    }
    displayStones = animFrames[animIdx]
    animIdx += 1
    draw()
    animRaf = requestAnimationFrame(step)
  }
  animRaf = requestAnimationFrame(step)
}

function draw() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const world = state.value?.world || {}
  const button = world.button || { x: 780, y: 240 }
  const rings = world.houseRings || [118, 78, 40, 14]
  const hog = world.hogLine || 520
  const r = world.stoneR || 15

  ctx.clearRect(0, 0, w, h)
  // ice
  const ice = ctx.createLinearGradient(0, 0, w, 0)
  ice.addColorStop(0, '#d7e8f2')
  ice.addColorStop(0.55, '#eaf4fa')
  ice.addColorStop(1, '#f4fafc')
  ctx.fillStyle = ice
  ctx.fillRect(0, 0, w, h)

  // boards
  ctx.fillStyle = '#8b4513'
  ctx.fillRect(0, 0, w, 28)
  ctx.fillRect(0, h - 28, w, 28)
  ctx.fillStyle = '#6e3610'
  ctx.fillRect(0, 28, 18, h - 56)
  ctx.fillRect(w - 18, 28, 18, h - 56)

  // center line
  ctx.strokeStyle = 'rgba(40, 70, 100, 0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, h / 2)
  ctx.lineTo(w, h / 2)
  ctx.stroke()

  // hog
  ctx.strokeStyle = 'rgba(180, 40, 40, 0.45)'
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(hog, 28)
  ctx.lineTo(hog, h - 28)
  ctx.stroke()
  ctx.setLineDash([])

  // house
  const houseColors = ['#c62828', '#fff', '#1565c0', '#fff']
  for (let i = 0; i < rings.length; i++) {
    ctx.beginPath()
    ctx.arc(button.x, button.y, rings[i], 0, Math.PI * 2)
    ctx.fillStyle = houseColors[i] || '#fff'
    ctx.globalAlpha = i === 1 || i === 3 ? 0.92 : 0.88
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(20, 40, 60, 0.25)'
    ctx.stroke()
  }
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(button.x, button.y, 3, 0, Math.PI * 2)
  ctx.fill()

  // throw pad
  ctx.fillStyle = 'rgba(30, 80, 120, 0.12)'
  ctx.fillRect(40, 36, 50, h - 72)

  // aim preview
  if (isMyTurn.value && state.value?.phase === 'aim' && !throwing.value) {
    const rad = (angle.value * Math.PI) / 180
    const len = 40 + power.value * 12
    ctx.strokeStyle = 'rgba(20, 60, 100, 0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(72, aimY.value)
    ctx.lineTo(72 + Math.cos(rad) * len, aimY.value + Math.sin(rad) * len)
    ctx.stroke()
    ctx.fillStyle = mePlayer.value?.color || '#e85d4c'
    ctx.globalAlpha = 0.45
    ctx.beginPath()
    ctx.arc(72, aimY.value, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  const stones = displayStones.length ? displayStones : state.value?.stones || []
  for (const s of stones) {
    if (s.out) continue
    drawStone(ctx, s.x, s.y, r, s.color || '#ccc')
  }
}

function drawStone(ctx, x, y, r, color) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y + 2, r * 0.92, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.fill()
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r)
  g.addColorStop(0, '#fff')
  g.addColorStop(0.35, color)
  g.addColorStop(1, shade(color, -25))
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, r * 0.42, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fill()
  ctx.restore()
}

function shade(hex, amt) {
  const h = String(hex || '#888').replace('#', '')
  if (h.length !== 6) return hex
  const n = (i) => Math.max(0, Math.min(255, parseInt(h.slice(i, i + 2), 16) + amt))
  return `#${[n(0), n(2), n(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function doThrow() {
  if (!isMyTurn.value || throwing.value) return
  throwing.value = true
  send({
    type: 'throw',
    power: power.value,
    angleDeg: angle.value,
    curl: curl.value,
    aimY: aimY.value,
  })
}

function createRoom() {
  error.value = ''
  send({ type: 'create', mode: createMode.value })
}

function createBotRoom() {
  error.value = ''
  send({ type: 'create_bot', difficulty: botDiff.value })
}

function joinRoom(code) {
  error.value = ''
  const id = String(code || joinCode.value || '')
    .trim()
    .toUpperCase()
  if (id.length < 4) return
  send({ type: 'join', roomId: id })
}

function tryRejoin(code) {
  send({ type: 'rejoin', roomId: code })
}

function leave() {
  intentionalLeave = true
  send({ type: 'leave' })
  inRoom.value = false
  state.value = null
  sessionStorage.removeItem(ROOM_KEY)
  savedRoom.value = ''
  chatLog.value = []
  intentionalLeave = false
  refreshList()
}

function refreshList() {
  send({ type: 'list' })
}

function tickDeadline() {
  const d = state.value?.turnDeadline
  if (!d || state.value?.phase !== 'aim') {
    turnLeftSec.value = null
    return
  }
  turnLeftSec.value = Math.max(0, Math.ceil((d - Date.now()) / 1000))
}

watch(
  () => state.value?.turnDeadline,
  () => tickDeadline()
)

onMounted(() => {
  connect()
  tickTimer = window.setInterval(tickDeadline, 250)
  window.addEventListener('resize', draw)
})

onUnmounted(() => {
  intentionalLeave = true
  clearTimeout(reconnectTimer)
  clearInterval(tickTimer)
  cancelAnimationFrame(animRaf)
  window.removeEventListener('resize', draw)
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
})
</script>

<style scoped>
.curl-page {
  padding: 1.25rem 1.2rem 1.5rem;
  animation: rise 0.4s ease both;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.75rem;
}

.tip {
  margin: 0.35rem 0 0;
}

.back {
  flex-shrink: 0;
  align-self: flex-start;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--muted);
  text-decoration: none;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.85);
}

.mode-pick {
  display: grid;
  gap: 0.65rem;
  margin-bottom: 0.9rem;
}

@media (min-width: 720px) {
  .mode-pick {
    grid-template-columns: repeat(3, 1fr);
  }
}

.mode-btn {
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.85rem 0.95rem;
  background: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
}

.mode-btn strong {
  font-size: 1.05rem;
}

.mode-btn span {
  color: var(--muted);
  font-size: 0.85rem;
}

.mode-btn.on {
  border-color: #3b82c4;
  background: linear-gradient(145deg, rgba(230, 242, 252, 0.95), rgba(255, 255, 255, 0.9));
  box-shadow: 0 0 0 1px rgba(59, 130, 196, 0.25);
}

.row,
.bot-row,
.join-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1.1rem;
  background: #1f5f8a;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.btn.ghost {
  background: rgba(20, 36, 48, 0.08);
  color: var(--ink);
}

.btn.sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
}

.btn.fire {
  background: #c62828;
  min-width: 6.5rem;
}

.btn.on {
  outline: 2px solid #3b82c4;
}

.code-input {
  width: 7rem;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
}

.count-lab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.room-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.room-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--line);
}

.mode-tag {
  font-style: normal;
  font-size: 0.75rem;
  font-weight: 800;
  color: #1f5f8a;
  margin-right: 0.35rem;
}

.rules-card {
  margin-top: 1rem;
  padding: 1rem 1.1rem;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.78);
}

.rules-card h2 {
  margin: 0 0 0.55rem;
  font-size: 1.05rem;
  font-family: var(--display);
}

.rules-card ol,
.rules-inline ol {
  margin: 0;
  padding-left: 1.2rem;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.55;
  display: grid;
  gap: 0.35rem;
}

.rules-inline {
  margin: 0.75rem 0 0.25rem;
  font-size: 0.9rem;
  color: var(--muted);
}

.scoreboard {
  margin: 0 0 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(31, 95, 138, 0.2);
  background: linear-gradient(145deg, rgba(232, 243, 250, 0.95), rgba(255, 255, 255, 0.9));
}

.score-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: baseline;
  margin-bottom: 0.55rem;
}

.score-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: center;
  margin-bottom: 0.55rem;
}

.tot {
  font-size: 1.25rem;
  font-weight: 800;
}

.tot.red {
  color: #c62828;
}

.tot.blue {
  color: #1565c0;
}

.tot-sep {
  font-weight: 800;
  color: var(--muted);
}

.tot-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--line);
  font-size: 0.88rem;
}

.tot-pill .dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  display: inline-block;
}

.end-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.end-table th,
.end-table td {
  text-align: left;
  padding: 0.35rem 0.4rem;
  border-top: 1px solid rgba(20, 40, 60, 0.08);
}

.end-table th {
  color: var(--muted);
  font-weight: 700;
  font-size: 0.78rem;
}

.end-table tr.latest td {
  background: rgba(31, 95, 138, 0.08);
  font-weight: 700;
}

.score-empty {
  margin: 0;
  font-size: 0.85rem;
}

.end-flash {
  margin: 0 0 0.65rem;
  padding: 0.55rem 0.85rem;
  border-radius: 12px;
  background: rgba(198, 40, 40, 0.1);
  color: #8b1c1c;
  font-weight: 800;
  animation: pop-in 0.35s ease both;
}

.live-score {
  margin: 0 0 0.65rem;
  padding: 0.55rem 0.85rem;
  border-radius: 12px;
  background: rgba(31, 95, 138, 0.1);
  color: #1f5f8a;
  font-weight: 800;
  font-size: 1.02rem;
}

.live-score.lead {
  background: rgba(46, 125, 50, 0.12);
  color: #1b5e20;
}

.live-inline {
  margin: 0 0 0.45rem;
  font-size: 0.92rem;
  color: #1f5f8a;
}

@keyframes pop-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.92rem;
}

.banner {
  margin: 0 0 0.65rem;
  font-weight: 700;
}

.test-tag {
  margin: 0 0 0.4rem;
  color: #1f5f8a;
  font-size: 0.88rem;
  font-weight: 700;
}

.canvas-wrap {
  width: 100%;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid rgba(30, 60, 90, 0.18);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
  background: #cfe0ea;
}

canvas {
  display: block;
  width: 100%;
  max-width: 960px;
  height: auto;
  margin: 0 auto;
  touch-action: none;
}

.hud-players {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.hp-card {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--line);
  font-size: 0.88rem;
}

.hp-card.me {
  border-color: #1f5f8a;
}

.hp-card.turn {
  box-shadow: 0 0 0 2px rgba(31, 95, 138, 0.35);
}

.hp-card.red {
  background: rgba(232, 93, 76, 0.1);
}

.hp-card.blue {
  background: rgba(59, 130, 196, 0.1);
}

.dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
}

.team-tag,
.left {
  color: var(--muted);
  font-size: 0.8rem;
}

.hp {
  font-weight: 800;
}

.actions {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.5rem;
}

.ctrl-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.ctrl-row label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.88rem;
  min-width: 160px;
  flex: 1;
}

.ctrl-row input[type='range'] {
  width: 100%;
}

.win {
  font-size: 1.15rem;
  font-weight: 800;
}

.wait,
.err,
.rejoin-hint {
  margin: 0.5rem 0;
}

.err {
  color: #b42318;
  font-weight: 600;
}

.muted {
  color: var(--muted);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 640px) {
  .curl-page {
    padding: 1rem 0.75rem 1.2rem;
  }
}
</style>
