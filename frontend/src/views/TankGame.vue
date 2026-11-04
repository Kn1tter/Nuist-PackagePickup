<template>
  <main class="panel tank-page">
    <header class="head">
      <div>
        <h1>坦克弹弹堂</h1>
        <p class="muted tip">{{ statusLine }}</p>
      </div>
      <RouterLink class="back" to="/arcade">← 小游戏</RouterLink>
    </header>

    <section v-if="!inRoom" class="lobby">
      <div class="mode-pick">
        <button
          type="button"
          class="mode-btn"
          :class="{ on: createMode === 'ffa' }"
          @click="createMode = 'ffa'"
        >
          <strong>大混战</strong>
          <span>2–5 人，最后存活者获胜</span>
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ on: createMode === 'teams' }"
          @click="createMode = 'teams'"
        >
          <strong>2v2 团队</strong>
          <span>红蓝各 2 人，同队不受伤</span>
        </button>
      </div>
      <div class="row">
        <button type="button" class="btn" :disabled="!ready" @click="createRoom">
          {{ createMode === 'teams' ? '开 2v2 房间' : '开混战房间' }}
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
            <option value="yjz">普通 yjz</option>
            <option value="yjz_full">全解放 yjz</option>
          </select>
        </label>
        <button type="button" class="btn" :disabled="!ready" @click="createBotRoom">创建人机房间</button>
      </div>
      <div v-if="isAdmin" class="admin-test">
        <p class="muted">管理员测试：独自操控多辆坦克（不记战绩）</p>
        <div class="row">
          <label class="count-lab">
            人数
            <select v-model.number="testCount">
              <option :value="2">2</option>
              <option :value="3">3</option>
              <option :value="4">4</option>
              <option :value="5">5</option>
            </select>
          </label>
          <button type="button" class="btn" :disabled="!ready" @click="createTestRoom">开启测试模式</button>
        </div>
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
            <em class="mode-tag">{{ r.modeLabel || (r.mode === 'teams' ? '2v2' : '混战') }}</em>
            {{ r.hostName }} · {{ r.id }} · {{ r.count }}/{{ r.max }}
          </span>
          <button type="button" class="btn ghost sm" @click="joinRoom(r.id)">加入</button>
        </li>
        <li v-if="!waiting.length" class="muted">暂无房间 · 大混战最多 5 人，或开 2v2</li>
      </ul>
      <details class="rules">
        <summary>规则摘要</summary>
        <p>
          简易弹弹堂：随机双层地形，轮流移动、调角度与力度开火。风力影响弹道，炮弹可削地形。进房后可自选坦克品种，开局锁定。
          大混战最后一人获胜；2v2 同队不受伤，灭掉对面整队获胜。
        </p>
        <ul class="type-rules">
          <li><strong>默认</strong>：均衡</li>
          <li><strong>破甲</strong>：直击伤害高，移动少</li>
          <li><strong>轰炸</strong>：爆炸范围大，血量 80</li>
          <li><strong>狙击</strong>：射程与移动更强，受伤更多</li>
          <li><strong>全解放</strong>：玩家对战仅管理员可选；人机「全解放 yjz」为该车体</li>
        </ul>
      </details>
    </section>

    <section v-else-if="state" class="battle">
      <div class="meta">
        <span>房间 <strong>{{ state.id }}</strong></span>
        <span v-if="state.status === 'playing'">
          风
          <strong>{{ windLabel }}</strong>
        </span>
        <span v-if="turnLeftSec != null && state.phase === 'aim'">剩 {{ turnLeftSec }}s</span>
        <button type="button" class="btn ghost sm" @click="leave">离开</button>
      </div>
      <p v-if="state.testMode" class="test-tag">测试模式 · 轮到哪辆就操控哪辆</p>
      <p v-else-if="state.vsBot" class="test-tag">人机房间 · {{ botDiffName(state.botDiff) }}</p>
      <p class="banner">{{ state.message }}</p>

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
            turn: state.turnIdx === p.seat && state.status === 'playing',
            out: p.dead,
            red: p.team === 0,
            blue: p.team === 1,
          }"
        >
          <span class="dot" :style="{ background: p.color }" />
          <strong>{{ p.nickname }}</strong>
          <span v-if="p.teamName" class="team-tag">{{ p.teamName }}</span>
          <span class="type-tag">{{ p.tankName || '默认坦克' }}</span>
          <span class="hp">{{ p.dead ? '出局' : `${p.hp}/${p.hpMax || 100}` }}</span>
        </div>
      </div>

      <div v-if="state.status === 'lobby'" class="actions">
        <p class="muted">
          <template v-if="state.vsBot">人机房间 · 选择你的坦克后开始</template>
          <template v-else-if="state.mode === 'teams'">
            2v2 · {{ state.players.length }}/4 · 红蓝各 2 人后开始 · 选择坦克
          </template>
          <template v-else>
            {{ state.testMode ? '测试' : '混战' }}人数 {{ state.players.length }}/{{ state.maxPlayers || 5 }}（至少 2
            人）· 选择坦克品种
          </template>
        </p>
        <div v-if="isHost && !state.testMode && !state.vsBot" class="row">
          <button
            type="button"
            class="btn ghost sm"
            :class="{ on: state.mode !== 'teams' }"
            @click="send({ type: 'set_mode', mode: 'ffa' })"
          >
            大混战
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
        <div v-if="state.mode === 'teams' && !state.testMode" class="row team-pick">
          <span class="muted">我的队伍</span>
          <button
            type="button"
            class="btn ghost sm"
            :class="{ on: meTank?.team === 0 }"
            @click="send({ type: 'set_team', team: 0 })"
          >
            红队
          </button>
          <button
            type="button"
            class="btn ghost sm"
            :class="{ on: meTank?.team === 1 }"
            @click="send({ type: 'set_team', team: 1 })"
          >
            蓝队
          </button>
        </div>
        <div v-if="state.testMode && isHost" class="row">
          <button
            v-for="n in [2, 3, 4, 5]"
            :key="n"
            type="button"
            class="btn ghost sm"
            :class="{ on: state.players.length === n }"
            @click="send({ type: 'set_test_count', count: n })"
          >
            {{ n }} 人
          </button>
        </div>

        <div v-for="p in selectablePlayers" :key="p.userId" class="type-pick">
          <p class="type-pick-title">
            <span class="dot" :style="{ background: p.color }" />
            {{ p.nickname }}
            <span class="muted">当前：{{ p.tankName }}</span>
          </p>
          <div class="type-grid">
            <button
              v-for="t in tankTypeOptions"
              :key="t.id"
              type="button"
              class="type-btn"
              :class="{ on: p.tankType === t.id }"
              @click="pickTankType(t.id, p.seat)"
            >
              <strong>{{ t.name }}</strong>
              <span>{{ t.blurb }}</span>
            </button>
          </div>
        </div>

        <button
          v-if="isHost"
          type="button"
          class="btn"
          :disabled="!canStart"
          @click="send({ type: 'start' })"
        >
          开始游戏
        </button>
        <p v-else class="muted">等待房主开始…</p>
      </div>

      <div v-else-if="isMyTurn && state.phase === 'aim'" class="actions aim">
        <div class="ctrl-row">
          <button type="button" class="btn ghost" @click="move(-1)">← 移动</button>
          <button type="button" class="btn ghost" @click="move(1)">移动 →</button>
          <span class="muted">移动力 {{ myMoveLeft }}</span>
        </div>
        <div class="ctrl-row">
          <label>
            角度 {{ angle }}°
            <input v-model.number="angle" type="range" min="0" max="90" @input="syncAim" />
          </label>
          <button type="button" class="btn ghost sm" @click="flipFacing">掉头</button>
        </div>
        <div class="ctrl-row power">
          <label>
            力度 {{ power }}
            <input v-model.number="power" type="range" min="5" max="100" />
          </label>
          <button type="button" class="btn fire" :disabled="firing" @click="fire">
            {{ firing ? '飞行中…' : '开火' }}
          </button>
          <button type="button" class="btn ghost" @click="send({ type: 'skip' })">跳过</button>
        </div>
      </div>

      <div v-else-if="state.status === 'ended'" class="actions">
        <p class="win">{{ state.message }}</p>
        <button type="button" class="btn" @click="leave">返回大厅</button>
      </div>

      <p v-else-if="state.status === 'playing'" class="muted wait">
        {{ state.phase === 'flying' ? '炮弹飞行中…' : '等待其他玩家操作…' }}
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

const ROOM_KEY = 'nuist_tank_room'
const router = useRouter()

const ready = ref(false)
const error = ref('')
const waiting = ref([])
const joinCode = ref('')
const botDiff = ref('normal')

function botDiffName(id) {
  return {
    easy: '简单',
    normal: '普通',
    hard: '困难',
    yjz: '普通 yjz',
    yjz_full: '全解放 yjz',
  }[id] || id || '普通'
}
const savedRoom = ref(sessionStorage.getItem(ROOM_KEY) || '')
const state = ref(null)
const inRoom = ref(false)
const chatLog = ref([])
const canvasEl = ref(null)
const angle = ref(45)
const power = ref(55)
/** 本回合已从服务端拉过瞄准角；拖动时不再被广播回写（否则调到 0 会乱跳） */
let aimTurnKey = ''
const firing = ref(false)
const turnLeftSec = ref(null)
const isAdmin = ref(!!getUser()?.is_admin)
const testCount = ref(2)
const createMode = ref('ffa')

let ws = null
let intentionalLeave = false
let reconnectTimer = 0
let reconnectAttempts = 0
let animRaf = 0
let shotAnim = null
let tickTimer = 0

const statusLine = computed(() => {
  if (!ready.value) return '连接中…'
  if (!inRoom.value) return '大混战最多 5 人 · 或 2v2 团队 · 60 秒限时'
  return state.value?.message || '对局中'
})

const canStart = computed(() => {
  const st = state.value
  if (!st) return false
  if (st.mode === 'teams') {
    const red = st.players?.filter((p) => p.team === 0).length || 0
    const blue = st.players?.filter((p) => p.team === 1).length || 0
    return st.players?.length === 4 && red === 2 && blue === 2
  }
  return (st.players?.length || 0) >= 2
})

const isMyTurn = computed(() => {
  if (state.value?.youCanAct) return true
  return (
    state.value?.status === 'playing' &&
    state.value?.phase === 'aim' &&
    state.value?.turnIdx === state.value?.you
  )
})

const isHost = computed(() => {
  if (state.value?.testMode) return !!state.value.players?.some((p) => p.isMe)
  return state.value?.you === 0
})

const myMoveLeft = computed(() => {
  const turn = state.value?.players?.[state.value.turnIdx]
  if (turn?.isMe && turn.moveLeft != null) return turn.moveLeft
  const p = state.value?.players?.[state.value.you]
  return p?.moveLeft ?? 0
})

const meTank = computed(() => {
  const st = state.value
  if (!st?.players) return null
  const turn = st.players[st.turnIdx]
  if (turn?.isMe) return turn
  return st.players.find((p) => p.isMe) || null
})

const windLabel = computed(() => {
  const w = state.value?.wind || 0
  if (!w) return '无风'
  return `${w > 0 ? '→' : '←'}${Math.abs(w)}`
})

const FALLBACK_TYPES = [
  { id: 'default', name: '默认坦克', blurb: '均衡：血量、移动、爆炸范围都适中', hpMax: 100, moveBudget: 90 },
  { id: 'pierce', name: '破甲坦克', blurb: '直接命中伤害更高，但本回合移动更少', hpMax: 100, moveBudget: 52 },
  { id: 'bomber', name: '轰炸坦克', blurb: '爆炸范围更大，但血量只有 80', hpMax: 80, moveBudget: 85 },
  { id: 'sniper', name: '狙击坦克', blurb: '射程更远、移动更多，但受到伤害增加', hpMax: 100, moveBudget: 125 },
  {
    id: 'glass',
    name: '玻璃坦克',
    blurb: '射程介于默认与狙击之间；打人或被打都是一炮死，对地形破坏更小',
    hpMax: 100,
    moveBudget: 95,
  },
  {
    id: 'vamp',
    name: '吸血坦克',
    blurb: '70/100 血；打中别人回血 90%（不可超过上限），对地形破坏更小',
    hpMax: 70,
    moveBudget: 90,
  },
  {
    id: 'yjz',
    name: 'yjz（全解放）',
    blurb: '150 血；狙击射程与机动；破甲直伤 + 轰炸范围 + 吸血；非一炮死（玩家对战仅管理员）',
    hpMax: 150,
    moveBudget: 125,
    adminOnly: true,
  },
]

const tankTypeOptions = computed(() => {
  const list = state.value?.tankTypes?.length ? state.value.tankTypes : FALLBACK_TYPES
  // 玩家对战：全解放仅管理员可见；人机/测试房不限
  if (state.value?.vsBot || state.value?.testMode || isAdmin.value) return list
  return list.filter((t) => t.id !== 'yjz' && !t.adminOnly)
})

const selectablePlayers = computed(() => {
  const list = state.value?.players || []
  if (state.value?.testMode) return list
  return list.filter((p) => p.isMe)
})

function pickTankType(tankType, seat) {
  if (state.value?.testMode) {
    send({ type: 'set_tank_type', tankType, seat })
  } else {
    send({ type: 'set_tank_type', tankType })
  }
}

function wsUrl() {
  if (apiBase) {
    const u = new URL(apiBase)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/api/tank/ws'
    return u.toString()
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api/tank/ws`
}

function send(msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg))
}

function sendChat(text) {
  send({ type: 'chat', text })
}

function connect() {
  if (!getUser() || !getToken()) {
    router.replace({ name: 'login', query: { redirect: '/arcade/tank' } })
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
      if (msg.user?.is_admin != null) isAdmin.value = !!msg.user.is_admin
      refreshList()
      if (savedRoom.value && !inRoom.value) {
        /* 手动点重连 */
      }
      return
    }
    if (msg.type === 'list') {
      waiting.value = msg.rooms || []
      return
    }
    if (msg.type === 'state') {
      const prev = state.value
      const next = { ...msg.state }
      // 对局中多数包不带地形/品种表，沿用上一帧，减流量
      if (!next.terrain && prev?.terrain) next.terrain = prev.terrain
      if (!next.tankTypes && prev?.tankTypes) next.tankTypes = prev.tankTypes
      if (!next.botDiffs && prev?.botDiffs) next.botDiffs = prev.botDiffs
      state.value = next
      inRoom.value = true
      sessionStorage.setItem(ROOM_KEY, next.id)
      savedRoom.value = next.id
      const turn = next.players?.[next.turnIdx]
      if (turn?.isMe && next.phase === 'aim') {
        const key = `${next.id}:${next.turnIdx}:${next.turnEndsAt}:${turn.userId}`
        if (key !== aimTurnKey) {
          aimTurnKey = key
          const a = Number(turn.angle)
          angle.value = Number.isFinite(a) ? Math.max(0, Math.min(90, a)) : 45
        }
      } else {
        aimTurnKey = ''
      }
      firing.value = next.phase === 'flying'
      if (next.shot?.path?.length) {
        // 落地结算会再推一帧 state，勿重开动效
        const sig = shotSignature(next.shot)
        if (!shotAnim || shotAnim.sig !== sig) playShot(next.shot)
      } else if (next.phase !== 'flying') {
        shotAnim = null
      }
      nextTick(draw)
      return
    }
    if (msg.type === 'chat') {
      const me = getUser()
      chatLog.value = [
        ...chatLog.value.slice(-80),
        {
          nickname: msg.nickname || msg.from || msg.student_id || '玩家',
          text: msg.text,
          self: Number(msg.userId) === Number(me?.id),
        },
      ]
      return
    }
    if (msg.type === 'left') {
      inRoom.value = false
      state.value = null
      sessionStorage.removeItem(ROOM_KEY)
      savedRoom.value = ''
      chatLog.value = []
      refreshList()
      return
    }
    if (msg.type === 'error') error.value = msg.error || '出错了'
  }
  ws.onclose = () => {
    ready.value = false
    if (intentionalLeave) return
    const delay = Math.min(8000, 600 * 2 ** reconnectAttempts++)
    reconnectTimer = window.setTimeout(connect, delay)
  }
}

function refreshList() {
  send({ type: 'list' })
}

function createRoom() {
  send({ type: 'create', mode: createMode.value })
}

function createBotRoom() {
  send({ type: 'create_bot', difficulty: botDiff.value })
}

function createTestRoom() {
  if (!isAdmin.value) return
  send({ type: 'create_test', count: testCount.value })
}

function joinRoom(code) {
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

function syncAim() {
  if (!isMyTurn.value) return
  const a = Number(angle.value)
  angle.value = Number.isFinite(a) ? Math.max(0, Math.min(90, a)) : 0
  send({ type: 'aim', angle: angle.value, facing: meTank.value?.facing })
}

function flipFacing() {
  if (!isMyTurn.value || !meTank.value) return
  const facing = meTank.value.facing === 1 ? -1 : 1
  send({ type: 'aim', angle: angle.value, facing })
}

function move(dir) {
  if (!isMyTurn.value) return
  send({ type: 'move', dir })
}

function fire() {
  if (!isMyTurn.value || firing.value) return
  send({ type: 'aim', angle: angle.value, facing: meTank.value?.facing })
  send({ type: 'fire', power: power.value })
}

function shotSignature(shot) {
  if (!shot) return ''
  const path = shot.path || []
  const a = path[0]
  const b = path[path.length - 1]
  return `${shot.shooterId}|${shot.durationMs}|${path.length}|${a?.x},${a?.y}|${b?.x},${b?.y}`
}

function playShot(shot) {
  const path = shot.path || []
  const durationMs = Math.max(800, Number(shot.durationMs) || Math.max(2200, path.length * 22))
  shotAnim = {
    sig: shotSignature(shot),
    path,
    hit: shot.hit,
    started: performance.now(),
    durationMs,
    holdMs: 220,
  }
}

function draw() {
  const canvas = canvasEl.value
  const st = state.value
  if (!canvas || !st?.terrain) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const t = st.terrain

  // sky
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#b8d4ea')
  g.addColorStop(0.55, '#dce9f2')
  g.addColorStop(1, '#c5d6c0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // upper platforms
  ctx.fillStyle = '#8b7355'
  for (let i = 0; i < t.cols; i++) {
    if (!t.upper[i]) continue
    const x = i * t.colW
    const top = H - t.upper[i]
    ctx.fillRect(x, top, t.colW + 0.5, 16)
  }
  ctx.fillStyle = '#6f9b5a'
  for (let i = 0; i < t.cols; i++) {
    if (!t.upper[i]) continue
    const x = i * t.colW
    const top = H - t.upper[i]
    ctx.fillRect(x, top, t.colW + 0.5, 4)
  }

  // ground
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (let i = 0; i < t.cols; i++) {
    const x = i * t.colW
    const y = H - t.ground[i]
    if (i === 0) ctx.lineTo(x, y)
    else ctx.lineTo(x + t.colW, y)
  }
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fillStyle = '#6b8f4e'
  ctx.fill()
  ctx.fillStyle = '#5a4a3a'
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (let i = 0; i < t.cols; i++) {
    const x = i * t.colW
    const y = H - t.ground[i] + 18
    if (i === 0) ctx.lineTo(x, Math.min(H, y))
    else ctx.lineTo(x + t.colW, Math.min(H, y))
  }
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()

  // tanks — 极简方块车身 + 炮管
  for (const p of st.players) {
    if (p.dead) continue
    drawTank(ctx, p, p.isMe && isMyTurn.value ? angle.value : p.angle)
  }

  // projectile — 时间轴插值，按显示器刷新率绘制
  if (shotAnim && shotAnim.path.length) {
    const pt = sampleShotPoint(shotAnim)
    const idx = Math.min(shotAnim.path.length - 1, Math.floor(shotProgress(shotAnim) * (shotAnim.path.length - 1)))
    ctx.fillStyle = '#222'
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(40,40,40,0.4)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const trailFrom = Math.max(0, idx - 18)
    for (let i = trailFrom; i <= idx; i++) {
      const q = shotAnim.path[i]
      if (i === trailFrom) ctx.moveTo(q.x, q.y)
      else ctx.lineTo(q.x, q.y)
    }
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    // 命中闪光（轰炸坦克范围更大）
    if (shotProgress(shotAnim) >= 1 && shotAnim.hit) {
      const br = shotAnim.blastR || 28
      ctx.fillStyle = 'rgba(255, 180, 60, 0.35)'
      ctx.beginPath()
      ctx.arc(shotAnim.hit.x, shotAnim.hit.y, Math.min(36, br * 0.55), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 120, 40, 0.55)'
      ctx.beginPath()
      ctx.arc(shotAnim.hit.x, shotAnim.hit.y, 10, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function shotProgress(anim) {
  if (!anim?.durationMs) return 1
  const elapsed = performance.now() - anim.started
  return Math.max(0, Math.min(1, elapsed / anim.durationMs))
}

function sampleShotPoint(anim) {
  const path = anim.path
  if (!path.length) return { x: 0, y: 0 }
  if (path.length === 1) return path[0]
  const t = shotProgress(anim)
  const f = t * (path.length - 1)
  const i0 = Math.floor(f)
  const i1 = Math.min(path.length - 1, i0 + 1)
  const u = f - i0
  const a = path[i0]
  const b = path[i1]
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
  }
}

function drawTank(ctx, p, angDeg) {
  const facing = p.facing >= 0 ? 1 : -1
  const x = p.x
  const y = p.y
  const kind = p.tankType || 'default'
  ctx.save()
  ctx.translate(x, y)

  ctx.fillStyle = p.color
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1

  if (kind === 'bomber') {
    // 更宽厚
    ctx.fillRect(-12, -7, 24, 13)
    ctx.strokeRect(-12, -7, 24, 13)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(-6, -11, 11, 5)
    ctx.fillStyle = '#333'
    ctx.fillRect(-13, 5, 26, 4)
  } else if (kind === 'pierce') {
    // 尖头楔形
    ctx.beginPath()
    ctx.moveTo(facing * 12, -1)
    ctx.lineTo(-facing * 8, -7)
    ctx.lineTo(-facing * 8, 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#333'
    ctx.fillRect(-10, 4, 20, 4)
  } else if (kind === 'sniper') {
    ctx.fillRect(-9, -5, 18, 10)
    ctx.strokeRect(-9, -5, 18, 10)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(-4, -9, 8, 4)
    ctx.fillStyle = '#333'
    ctx.fillRect(-10, 4, 20, 3)
  } else if (kind === 'glass') {
    // 半透明玻璃体
    ctx.globalAlpha = 0.55
    ctx.fillStyle = '#9fd9ef'
    ctx.fillRect(-9, -6, 18, 11)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.strokeRect(-9, -6, 18, 11)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillRect(-4, -10, 8, 4)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#5a7a88'
    ctx.fillRect(-10, 4, 20, 3)
  } else if (kind === 'vamp') {
    ctx.fillStyle = '#8b1e2d'
    ctx.fillRect(-10, -6, 20, 11)
    ctx.strokeRect(-10, -6, 20, 11)
    ctx.fillStyle = 'rgba(255,120,140,0.45)'
    ctx.fillRect(-5, -10, 9, 5)
    ctx.fillStyle = '#3a0a12'
    ctx.fillRect(-11, 4, 22, 4)
  } else if (kind === 'yjz') {
    // 全解放：宽体 + 长炮
    const g = ctx.createLinearGradient(-12, -8, 12, 8)
    g.addColorStop(0, '#1a1a2e')
    g.addColorStop(0.5, '#c9a227')
    g.addColorStop(1, '#8b1e2d')
    ctx.fillStyle = g
    ctx.fillRect(-12, -7, 24, 13)
    ctx.strokeStyle = 'rgba(255,215,120,0.7)'
    ctx.strokeRect(-12, -7, 24, 13)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(-5, -11, 10, 5)
    ctx.fillStyle = '#111'
    ctx.fillRect(-13, 5, 26, 4)
  } else {
    ctx.fillRect(-10, -6, 20, 11)
    ctx.strokeRect(-10, -6, 20, 11)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(-5, -10, 9, 5)
    ctx.fillStyle = '#333'
    ctx.fillRect(-11, 4, 22, 4)
  }

  const ang = ((angDeg || 45) * Math.PI) / 180
  const barrel =
    kind === 'sniper' || kind === 'yjz'
      ? 24
      : kind === 'pierce'
        ? 18
        : kind === 'bomber'
          ? 13
          : kind === 'glass'
            ? 19
            : 16
  const thick =
    kind === 'yjz' ? 3.2 : kind === 'sniper' ? 2 : kind === 'bomber' ? 3.4 : kind === 'glass' ? 2.2 : kind === 'vamp' ? 2.6 : 2.5
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = thick
  ctx.beginPath()
  ctx.moveTo(0, -2)
  ctx.lineTo(facing * Math.cos(ang) * barrel, -2 - Math.sin(ang) * barrel)
  ctx.stroke()

  ctx.fillStyle = '#111'
  ctx.font = '9px sans-serif'
  ctx.textAlign = 'center'
  const label = p.isMe ? `你·${shortType(kind)}` : shortType(kind)
  ctx.fillText(label, 0, -14)

  ctx.restore()
}

function shortType(id) {
  return {
    default: '默',
    pierce: '破',
    bomber: '轰',
    sniper: '狙',
    glass: '玻',
    vamp: '吸',
    yjz: '全',
  }[id] || '默'
}

function animate() {
  draw()
  animRaf = requestAnimationFrame(animate)
}

function updateTurnClock() {
  const ends = state.value?.turnEndsAt
  if (!ends || state.value?.phase !== 'aim') {
    turnLeftSec.value = null
    return
  }
  turnLeftSec.value = Math.max(0, Math.ceil((ends - Date.now()) / 1000))
}

watch(
  () => state.value?.terrain,
  () => nextTick(draw)
)

onMounted(() => {
  connect()
  animRaf = requestAnimationFrame(animate)
  tickTimer = window.setInterval(updateTurnClock, 250)
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  intentionalLeave = true
  window.clearTimeout(reconnectTimer)
  window.clearInterval(tickTimer)
  cancelAnimationFrame(animRaf)
  window.removeEventListener('keydown', onKey)
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
})

function onKey(e) {
  if (!isMyTurn.value || state.value?.phase !== 'aim') return
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
    e.preventDefault()
    move(1)
  } else if (e.key === ' ') {
    e.preventDefault()
    fire()
  }
}
</script>

<style scoped>
.tank-page {
  padding: 1.2rem 1.3rem 1.5rem;
  animation: rise 0.4s ease both;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.7rem;
}

.tip {
  margin: 0.35rem 0 0;
}

.back {
  flex-shrink: 0;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--muted);
  text-decoration: none;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
}

.mode-pick {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.55rem;
  margin-bottom: 0.75rem;
}

@media (min-width: 560px) {
  .mode-pick {
    grid-template-columns: 1fr 1fr;
  }
}

.mode-btn {
  text-align: left;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  display: grid;
  gap: 0.2rem;
}

.mode-btn strong {
  font-family: var(--display);
  font-size: 1.05rem;
}

.mode-btn span {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.35;
}

.mode-btn.on {
  border-color: #535353;
  box-shadow: inset 0 0 0 1px #535353;
}

.mode-tag {
  font-style: normal;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(31, 122, 77, 0.12);
  color: var(--accent);
  margin-right: 0.35rem;
}

.team-tag {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
}

.hp-card.red .team-tag {
  background: rgba(232, 93, 76, 0.18);
  color: #c0392b;
}

.hp-card.blue .team-tag {
  background: rgba(59, 130, 196, 0.18);
  color: #1f5f9a;
}

.btn.on {
  background: var(--bg-deep);
  color: #fff;
  border-color: transparent;
}

.bot-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  margin: 0.65rem 0;
}

.lobby .row,
.join-row,
.ctrl-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.65rem;
}

.admin-test {
  margin: 0.75rem 0 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: 10px;
  border: 1px dashed rgba(192, 57, 43, 0.35);
  background: rgba(192, 57, 43, 0.06);
}

.admin-test p {
  margin: 0 0 0.5rem;
}

.count-lab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
}

.count-lab select {
  padding: 0.3rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--line);
}

.test-tag {
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #c0392b;
}

.btn.on {
  border-color: var(--accent-2);
  color: var(--accent-2);
}

.code-input {
  width: 6rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--line);
}

.room-list {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0;
  display: grid;
  gap: 0.4rem;
}

.room-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.7);
}

.rejoin-hint,
.rules {
  margin: 0.75rem 0;
  font-size: 0.9rem;
}

.rules p {
  margin: 0.4rem 0 0;
  color: var(--muted);
  line-height: 1.45;
}

.type-rules {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.5;
}

.type-pick {
  margin: 0.65rem 0 0.85rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
}

.type-pick-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.4rem;
}

.type-btn {
  text-align: left;
  padding: 0.5rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #fff;
  cursor: pointer;
  display: grid;
  gap: 0.2rem;
}

.type-btn strong {
  font-size: 0.86rem;
}

.type-btn span {
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
}

.type-btn.on {
  border-color: var(--accent-2, #2a7a4b);
  box-shadow: inset 0 0 0 1px var(--accent-2, #2a7a4b);
}

.type-tag {
  font-size: 0.72rem;
  color: var(--muted);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.banner {
  margin: 0 0 0.65rem;
  font-weight: 600;
}

.canvas-wrap {
  width: 100%;
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #cfdde8;
  box-shadow: var(--shadow);
}

canvas {
  display: block;
  width: 100%;
  max-width: 960px;
  height: auto;
  margin: 0 auto;
}

.hud-players {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.75rem 0;
}

.hp-card {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.85);
  font-size: 0.86rem;
}

.hp-card.me {
  border-color: var(--accent-2);
}

.hp-card.turn {
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.35);
}

.hp-card.out {
  opacity: 0.5;
}

.dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
}

.actions {
  margin: 0.5rem 0 0.75rem;
}

.aim label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.88rem;
  min-width: 160px;
  flex: 1;
}

.aim input[type='range'] {
  width: 100%;
}

.fire {
  background: #e85d4c !important;
  border-color: transparent !important;
  color: #fff !important;
}

.wait {
  margin: 0.5rem 0;
}

.win {
  font-weight: 700;
  font-size: 1.05rem;
}

.err {
  color: #c0392b;
}

.sm {
  padding: 0.3rem 0.65rem;
  font-size: 0.82rem;
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

@media (max-width: 700px) {
  .tank-page {
    padding: 1rem;
  }
}
</style>
