<template>
  <main class="panel skull-page">
    <header class="head">
      <div>
        <h1>骷髅牌 · Skull</h1>
        <p class="muted tip">{{ statusLine }}</p>
      </div>
      <RouterLink class="back" to="/arcade">← 小游戏</RouterLink>
    </header>

    <section v-if="!inRoom" class="lobby">
      <div class="row">
        <button type="button" class="btn" :disabled="!ready" @click="createRoom">创建房间</button>
        <button type="button" class="btn ghost" :disabled="!ready" @click="refreshList">刷新</button>
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
          <span>{{ r.hostName }} · {{ r.id }} · {{ r.count }}/6</span>
          <button type="button" class="btn ghost sm" @click="joinRoom(r.id)">加入</button>
        </li>
        <li v-if="!waiting.length" class="muted">暂无房间，需 3–6 人</li>
      </ul>
      <details class="rules">
        <summary>规则摘要</summary>
        <p>每人 3 玫瑰 + 1 骷髅。放置 → 竞标 → 翻牌。成功挑战 2 次，或剩最后一人获胜。翻到骷髅则弃一张牌，没牌出局。</p>
      </details>
    </section>

    <section v-else-if="state" class="table">
      <div class="meta">
        <span>房间 <strong>{{ state.id }}</strong></span>
        <span>{{ phaseLabel }}</span>
        <span v-if="state.bid">竞标 {{ state.bid.amount }}</span>
        <span v-if="actionLeftSec != null && state.status === 'playing'">操作剩 {{ actionLeftSec }}s</span>
        <button type="button" class="btn ghost sm" @click="leave">离开</button>
      </div>
      <p class="banner">{{ state.message }}</p>

      <div class="seats">
        <article
          v-for="p in state.players"
          :key="p.userId"
          class="seat"
          :class="{
            me: p.isMe,
            turn: state.turnIdx === p.seat && state.status === 'playing',
            out: p.eliminated,
            challenger: state.challenge?.challengerIdx === p.seat,
          }"
        >
          <header>
            <strong>{{ p.nickname }}</strong>
            <span class="score">★{{ p.score }}</span>
            <span v-if="p.eliminated" class="tag">淘汰</span>
            <span v-else-if="!p.connected" class="tag dim">断线</span>
          </header>
          <div class="stack">
            <div
              v-for="(c, i) in p.stack"
              :key="i"
              class="disc"
              :class="c.face"
              :style="{ zIndex: i, transform: `translate(${i * 4}px, ${-i * 3}px)` }"
            >
              {{ c.face === 'back' ? '?' : c.face === 'rose' ? '玫瑰' : '骷髅' }}
            </div>
            <span v-if="!p.stack.length" class="muted empty">空</span>
          </div>
          <p class="hand-count">手牌 {{ p.handCount }} · 牌堆 {{ p.stackCount }}</p>
          <button
            v-if="canReveal && state.challenge?.challengerIdx === state.you && p.stackCount > 0"
            type="button"
            class="btn sm reveal-btn"
            :disabled="revealBlocked(p)"
            @click="reveal(p.seat)"
          >
            翻 ta
          </button>
        </article>
      </div>

      <div v-if="state.challenge?.flipped?.length" class="flipped-log">
        <span v-for="(f, i) in state.challenge.flipped" :key="i" class="chip" :class="f.face">
          {{ state.players[f.playerIdx]?.nickname }}·{{ f.face === 'rose' ? '玫瑰' : '骷髅' }}
        </span>
      </div>

      <!-- actions -->
      <div v-if="state.status === 'lobby'" class="actions">
        <p class="muted">人数 {{ state.players.length }}/6（至少 3 人）</p>
        <button
          v-if="state.you === 0"
          type="button"
          class="btn"
          :disabled="state.players.length < 3"
          @click="send({ type: 'start' })"
        >
          开始游戏
        </button>
        <p v-else class="muted">等待房主开始…</p>
      </div>

      <div v-else-if="isMyTurn && state.phase === 'place'" class="actions">
        <p>选择放置：</p>
        <div class="hand">
          <button
            v-for="(card, i) in myHand"
            :key="i"
            type="button"
            class="disc btn-disc"
            :class="card"
            @click="send({ type: 'place', card })"
          >
            {{ card === 'rose' ? '玫瑰' : '骷髅' }}
          </button>
        </div>
        <div class="bid-start" v-if="myStackCount >= 1">
          <label>
            竞标数字
            <input v-model.number="bidAmount" type="number" min="1" :max="state.totalCards" />
          </label>
          <button type="button" class="btn" @click="startBid">宣布竞标</button>
        </div>
      </div>

      <div v-else-if="isMyTurn && state.phase === 'bid'" class="actions">
        <label>
          加价至
          <input
            v-model.number="bidAmount"
            type="number"
            :min="(state.bid?.amount || 0) + 1"
            :max="state.totalCards"
          />
        </label>
        <button type="button" class="btn" @click="send({ type: 'bid_raise', amount: bidAmount })">加价</button>
        <button type="button" class="btn ghost" @click="send({ type: 'bid_pass' })">过</button>
      </div>

      <div v-else-if="state.phase === 'reveal' && state.challenge?.challengerIdx === state.you" class="actions">
        <p>先翻自己牌堆（点自己座位「翻 ta」），再翻他人。目标：{{ state.challenge.target }} 朵玫瑰</p>
      </div>

      <div v-else-if="state.phase === 'discard' && state.discardFor === state.you" class="actions">
        <p>挑战失败，选择丢弃一张：</p>
        <div class="hand">
          <button
            v-for="(card, i) in myHand"
            :key="i"
            type="button"
            class="disc btn-disc"
            :class="card"
            @click="send({ type: 'discard', card })"
          >
            {{ card === 'rose' ? '玫瑰' : '骷髅' }}
          </button>
        </div>
      </div>

      <div v-else-if="state.status === 'ended'" class="actions">
        <p class="win">{{ state.message }}</p>
        <button type="button" class="btn" @click="leave">返回大厅</button>
      </div>

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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import GameChat from '../components/GameChat.vue'
import { apiBase, getToken, getUser, request } from '../api/request'

const ROOM_KEY = 'nuist_skull_room'
const router = useRouter()

const ready = ref(false)
const error = ref('')
const waiting = ref([])
const joinCode = ref('')
const savedRoom = ref(sessionStorage.getItem(ROOM_KEY) || '')
const state = ref(null)
const inRoom = ref(false)
const bidAmount = ref(1)
const chatLog = ref([])
const meId = ref(getUser()?.id)
const actionLeftSec = ref(null)

let ws = null
let intentionalLeave = false
let reconnectTimer = 0
let reconnectAttempts = 0
let actionTick = 0

const statusLine = computed(() => {
  if (!ready.value) return '连接中…'
  if (!inRoom.value) return '3–6 人心理博弈 · 登录联机'
  return state.value?.message || '对局中'
})

const phaseLabel = computed(() => {
  const m = {
    lobby: '大厅',
    place: '放置',
    bid: '竞标',
    reveal: '翻牌',
    discard: '弃牌',
    ended: '结束',
  }
  return m[state.value?.phase] || state.value?.phase || ''
})

const isMyTurn = computed(
  () => state.value?.status === 'playing' && state.value?.turnIdx === state.value?.you
)
const myHand = computed(() => state.value?.players?.[state.value.you]?.hand || [])
const myStackCount = computed(() => state.value?.players?.[state.value.you]?.stackCount || 0)
const canReveal = computed(() => state.value?.phase === 'reveal')

function revealBlocked(p) {
  if (!state.value?.challenge) return true
  const ch = state.value.challenge
  const self = state.value.players[ch.challengerIdx]
  if (p.seat !== ch.challengerIdx && self?.stackCount > 0) return true
  return false
}

function wsUrl() {
  if (apiBase) {
    const u = new URL(apiBase)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/api/skull/ws'
    return u.toString()
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api/skull/ws`
}

function remember(id) {
  if (id) {
    sessionStorage.setItem(ROOM_KEY, id)
    savedRoom.value = id
  } else {
    sessionStorage.removeItem(ROOM_KEY)
    savedRoom.value = ''
  }
}

function connect() {
  const token = getToken()
  if (!token) {
    router.replace({ name: 'login', query: { redirect: '/arcade/skull' } })
    return
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  ws = new WebSocket(wsUrl())
  ws.onopen = () => {
    reconnectAttempts = 0
    ws.send(JSON.stringify({ type: 'auth', token }))
  }
  ws.onmessage = (ev) => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    onMsg(msg)
  }
  ws.onerror = () => {
    error.value = '连接失败，正在重试…'
  }
  ws.onclose = () => {
    ready.value = false
    if (intentionalLeave) return
    if (!error.value) error.value = '连接断开'
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (reconnectAttempts >= 8) {
    error.value = '重连失败'
    return
  }
  const delay = Math.min(8000, 800 * 2 ** reconnectAttempts)
  reconnectAttempts += 1
  reconnectTimer = window.setTimeout(() => connect(), delay)
}

function onMsg(msg) {
  if (msg.type === 'authed') {
    ready.value = true
    error.value = ''
    const pending = sessionStorage.getItem(ROOM_KEY)
    if (pending && (inRoom.value || reconnectAttempts > 0)) {
      tryRejoin(pending)
      return
    }
    refreshList()
    return
  }
  if (msg.type === 'error') {
    error.value = msg.error || '出错了'
    return
  }
  if (msg.type === 'list') {
    waiting.value = msg.rooms || []
    return
  }
  if (msg.type === 'state') {
    const prev = state.value
    state.value = msg.state
    inRoom.value = true
    remember(msg.state.id)
    error.value = ''
    if (msg.state.bid) bidAmount.value = msg.state.bid.amount + 1
    else bidAmount.value = 1
    // 新开局清聊天
    if (prev && prev.status === 'lobby' && msg.state.status === 'playing') {
      chatLog.value = []
    }
    return
  }
  if (msg.type === 'chat') {
    chatLog.value = [
      ...chatLog.value.slice(-80),
      {
        nickname: msg.from || '玩家',
        text: msg.text,
        self: Number(msg.userId) === Number(meId.value),
      },
    ]
    return
  }
  if (msg.type === 'left') {
    inRoom.value = false
    state.value = null
    chatLog.value = []
    remember('')
    refreshList()
  }
}

function sendChat(text) {
  send({ type: 'chat', text })
}

function send(payload) {
  error.value = ''
  ws?.send(JSON.stringify(payload))
}

function createRoom() {
  send({ type: 'create' })
}
function joinRoom(code) {
  const id = (typeof code === 'string' ? code : joinCode.value).trim().toUpperCase()
  if (id.length < 4) return
  send({ type: 'join', roomId: id })
}
function tryRejoin(id) {
  send({ type: 'rejoin', roomId: String(id).trim().toUpperCase() })
}
async function refreshList() {
  try {
    waiting.value = (await request('/skull/rooms')).rooms || []
  } catch {
    send({ type: 'list' })
  }
}
function leave() {
  intentionalLeave = true
  remember('')
  send({ type: 'leave' })
  inRoom.value = false
  state.value = null
  chatLog.value = []
  setTimeout(() => {
    intentionalLeave = false
  }, 400)
  refreshList()
}
function startBid() {
  send({ type: 'start_bid', amount: bidAmount.value })
}
function reveal(playerIdx) {
  send({ type: 'reveal', playerIdx })
}

function updateActionClock() {
  const ends = state.value?.actionEndsAt
  if (!ends || state.value?.status !== 'playing') {
    actionLeftSec.value = null
    return
  }
  actionLeftSec.value = Math.max(0, Math.ceil((ends - Date.now()) / 1000))
}

onMounted(() => {
  if (!getUser()) {
    router.replace({ name: 'login', query: { redirect: '/arcade/skull' } })
    return
  }
  connect()
  actionTick = window.setInterval(updateActionClock, 250)
})
onUnmounted(() => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  window.clearInterval(actionTick)
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
})
</script>

<style scoped>
.skull-page {
  padding: 1.2rem 1.2rem 2rem;
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
  font-size: 1.55rem;
}
.tip {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
}
.back {
  color: var(--muted);
  text-decoration: none;
  font-weight: 600;
}
.lobby {
  display: grid;
  gap: 0.85rem;
  max-width: 440px;
}
.row,
.join-row {
  display: flex;
  gap: 0.55rem;
}
.code-input {
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
}
.rejoin-hint {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  margin: 0;
}
.room-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.room-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
}
.rules {
  font-size: 0.88rem;
  color: var(--muted);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}
.banner {
  margin: 0 0 0.9rem;
  font-weight: 700;
  color: var(--accent-2, #c45c26);
}
.seats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.seat {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.78);
  min-height: 140px;
  position: relative;
}
.seat.me {
  outline: 2px solid rgba(196, 92, 38, 0.45);
}
.seat.turn {
  box-shadow: 0 0 0 2px rgba(34, 122, 84, 0.55);
}
.seat.out {
  opacity: 0.45;
}
.seat.challenger {
  background: linear-gradient(160deg, rgba(255, 244, 220, 0.95), rgba(255, 255, 255, 0.8));
}
.seat header {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}
.score {
  font-weight: 800;
  color: #b45309;
}
.tag {
  font-size: 0.72rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: #fee2e2;
  color: #991b1b;
}
.tag.dim {
  background: #e5e7eb;
  color: #4b5563;
}
.stack {
  height: 72px;
  position: relative;
  margin: 0.4rem 0;
}
.disc {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 2px solid #333;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 800;
  position: absolute;
  left: 8px;
  top: 8px;
  background: #d6d3d1;
  color: #111;
}
.disc.rose {
  background: radial-gradient(circle at 30% 30%, #fecdd3, #e11d48);
  color: #fff;
  border-color: #9f1239;
}
.disc.skull {
  background: radial-gradient(circle at 30% 30%, #e5e5e5, #525252);
  color: #fafafa;
  border-color: #171717;
}
.disc.back {
  background: radial-gradient(circle at 30% 30%, #a7f3d0, #047857);
  color: #ecfdf5;
  border-color: #064e3b;
}
.empty {
  font-size: 0.8rem;
}
.hand-count {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.reveal-btn {
  margin-top: 0.4rem;
}
.flipped-log {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.8rem;
}
.chip {
  font-size: 0.78rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: #e5e7eb;
  font-weight: 700;
}
.chip.rose {
  background: #fecdd3;
  color: #9f1239;
}
.chip.skull {
  background: #404040;
  color: #f5f5f5;
}
.actions {
  display: grid;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.75);
  max-width: 520px;
}
.hand {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.btn-disc {
  position: relative;
  left: 0;
  top: 0;
  cursor: pointer;
}
.bid-start {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.bid-start input,
.actions input {
  width: 4.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--line);
}
.win {
  font-size: 1.1rem;
  font-weight: 800;
  margin: 0;
}
.err {
  color: #c0392b;
  margin: 0.5rem 0 0;
}
.btn.sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
}
</style>
