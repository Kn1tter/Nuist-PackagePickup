<template>
  <main v-if="group" class="wrap">
    <section class="panel head">
      <div class="title-row">
        <div>
          <h1>{{ group.name }}</h1>
          <p class="muted">
            创建者 {{ group.creator_name || '同学' }} · {{ members.length }} 名成员
          </p>
        </div>
        <div class="actions">
          <button v-if="!group.joined" class="btn" type="button" @click="join">加入本组</button>
          <button
            v-else-if="!group.can_manage"
            class="btn ghost"
            type="button"
            @click="leave"
          >
            退出
          </button>
          <button v-if="group.can_manage" class="btn ghost danger" type="button" @click="removeGroup">
            删除组
          </button>
        </div>
      </div>
      <p v-if="group.description" class="desc">{{ group.description }}</p>
    </section>

    <section v-if="group.joined" class="panel chat">
      <div class="chat-head">
        <h2>组内聊天室</h2>
        <span class="muted live">约每 3 秒刷新</span>
      </div>
      <div ref="chatBox" class="chat-box">
        <p v-if="!chatMessages.length" class="muted empty-chat">还没有消息，打个招呼吧。</p>
        <div
          v-for="m in chatMessages"
          :key="m.id"
          class="bubble"
          :class="{ mine: m.mine }"
        >
          <div class="bubble-meta">
            <strong>{{ m.mine ? '我' : m.nickname || '同学' }}</strong>
            <span>{{ formatTime(m.created_at) }}</span>
            <button v-if="m.can_delete" class="x" type="button" @click="deleteChat(m.id)">删</button>
          </div>
          <p>{{ m.body }}</p>
        </div>
      </div>
      <form class="chat-form" @submit.prevent="sendChat">
        <input
          v-model="chatText"
          maxlength="1000"
          placeholder="说点什么…"
          required
          :disabled="chatSending"
        />
        <button class="btn" type="submit" :disabled="chatSending || !chatText.trim()">
          {{ chatSending ? '…' : '发送' }}
        </button>
      </form>
      <p v-if="chatError" class="err">{{ chatError }}</p>
    </section>
    <p v-else class="hint muted">加入本组后可进入聊天室、发布开黑邀请。</p>

    <section v-if="group.joined" class="panel invite-form">
      <h2>发开黑邀请</h2>
      <form @submit.prevent="postInvite">
        <div class="field">
          <label>标题</label>
          <input v-model="invite.title" maxlength="120" placeholder="今晚双排 / 缺一补一" required />
        </div>
        <div class="field">
          <label>详情</label>
          <textarea
            v-model="invite.body"
            rows="3"
            maxlength="1000"
            placeholder="时间、段位、语音方式…"
            required
          />
        </div>
        <div class="field">
          <label>联系方式（可选）</label>
          <input v-model="invite.contact" maxlength="80" placeholder="QQ / 微信 / 游戏 ID" />
        </div>
        <p v-if="inviteError" class="err">{{ inviteError }}</p>
        <button class="btn" type="submit" :disabled="posting">
          {{ posting ? '发布中…' : '发布邀请' }}
        </button>
      </form>
    </section>

    <section class="invites">
      <h2>开黑邀请</h2>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="!invites.length" class="muted">暂时没有邀请。</p>
      <article v-for="i in invites" :key="i.id" class="panel card" :class="{ closed: i.status !== 'open' }">
        <div class="card-top">
          <strong>{{ i.title }}</strong>
          <span class="status" :class="i.status">{{ i.status === 'open' ? '招募中' : '已结束' }}</span>
        </div>
        <p class="body">{{ i.body }}</p>
        <div class="meta muted">
          <span>{{ i.nickname || '同学' }}</span>
          <span v-if="i.contact">联系：{{ i.contact }}</span>
          <span>{{ formatTime(i.created_at) }}</span>
        </div>
        <div v-if="i.can_delete" class="card-actions">
          <button
            v-if="i.status === 'open'"
            class="btn ghost"
            type="button"
            @click="closeInvite(i.id)"
          >
            结束招募
          </button>
          <button class="link-del" type="button" @click="deleteInvite(i.id)">删除</button>
        </div>
      </article>
    </section>

    <section class="panel members">
      <h2>成员</h2>
      <ul>
        <li v-for="m in members" :key="m.user_id">
          {{ m.nickname || '同学' }}
          <span class="muted">{{ m.student_id }}</span>
        </li>
      </ul>
    </section>
  </main>
  <p v-else-if="error" class="err">{{ error }}</p>
  <p v-else class="muted">加载中…</p>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request } from '../api/request'

const route = useRoute()
const router = useRouter()
const group = ref(null)
const members = ref([])
const invites = ref([])
const error = ref('')
const posting = ref(false)
const inviteError = ref('')
const invite = reactive({ title: '', body: '', contact: '' })

const chatMessages = ref([])
const chatText = ref('')
const chatSending = ref(false)
const chatError = ref('')
const chatBox = ref(null)
let pollTimer = null

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16)
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function scrollChat() {
  await nextTick()
  if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight
}

async function loadChat({ incremental = false } = {}) {
  if (!group.value?.joined) return
  try {
    const after = incremental && chatMessages.value.length
      ? chatMessages.value[chatMessages.value.length - 1].id
      : 0
    const data = await request(
      `/games/groups/${route.params.id}/chat${after ? `?after=${after}` : ''}`
    )
    const list = data.messages || []
    if (!incremental) {
      chatMessages.value = list
      await scrollChat()
    } else if (list.length) {
      chatMessages.value = [...chatMessages.value, ...list]
      await scrollChat()
    }
    chatError.value = ''
  } catch (e) {
    chatError.value = e.message
  }
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(() => loadChat({ incremental: true }), 3000)
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function load() {
  error.value = ''
  try {
    const data = await request(`/games/groups/${route.params.id}`)
    group.value = data.group
    members.value = data.members || []
    invites.value = data.invites || []
    if (data.group?.joined) {
      await loadChat({ incremental: false })
      startPoll()
    } else {
      chatMessages.value = []
      stopPoll()
    }
  } catch (e) {
    error.value = e.message
    stopPoll()
  }
}

async function join() {
  try {
    await request(`/games/groups/${route.params.id}/join`, { method: 'POST' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function leave() {
  try {
    await request(`/games/groups/${route.params.id}/leave`, { method: 'POST' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function removeGroup() {
  if (!confirm('确定删除该游戏组？邀请与聊天记录也会一起删除。')) return
  try {
    stopPoll()
    await request(`/games/groups/${route.params.id}`, { method: 'DELETE' })
    router.replace('/games')
  } catch (e) {
    error.value = e.message
  }
}

async function sendChat() {
  const body = chatText.value.trim()
  if (!body) return
  chatSending.value = true
  chatError.value = ''
  try {
    const data = await request(`/games/groups/${route.params.id}/chat`, {
      method: 'POST',
      body: { body },
    })
    chatText.value = ''
    if (data.message) {
      chatMessages.value = [...chatMessages.value, data.message]
      await scrollChat()
    } else {
      await loadChat({ incremental: true })
    }
  } catch (e) {
    chatError.value = e.message
  } finally {
    chatSending.value = false
  }
}

async function deleteChat(id) {
  try {
    await request(`/games/chat/${id}`, { method: 'DELETE' })
    chatMessages.value = chatMessages.value.filter((m) => m.id !== id)
  } catch (e) {
    chatError.value = e.message
  }
}

async function postInvite() {
  posting.value = true
  inviteError.value = ''
  try {
    await request(`/games/groups/${route.params.id}/invites`, {
      method: 'POST',
      body: { ...invite },
    })
    invite.title = ''
    invite.body = ''
    invite.contact = ''
    await load()
  } catch (e) {
    inviteError.value = e.message
  } finally {
    posting.value = false
  }
}

async function closeInvite(id) {
  try {
    await request(`/games/invites/${id}/close`, { method: 'POST' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function deleteInvite(id) {
  if (!confirm('确定删除这条邀请？')) return
  try {
    await request(`/games/invites/${id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

watch(
  () => route.params.id,
  () => {
    stopPoll()
    load()
  }
)

onMounted(load)
onUnmounted(stopPoll)
</script>

<style scoped>
.wrap {
  display: grid;
  gap: 1rem;
}

.head,
.invite-form,
.card,
.members,
.chat {
  padding: 1.2rem 1.3rem;
}

.title-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.7rem;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.chat-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}

.chat-head h2 {
  margin: 0;
}

.live {
  font-size: 0.78rem;
}

.chat-box {
  height: min(360px, 50vh);
  overflow-y: auto;
  display: grid;
  gap: 0.55rem;
  padding: 0.75rem;
  border-radius: 14px;
  background: rgba(15, 47, 36, 0.06);
  border: 1px solid var(--line);
  margin-bottom: 0.75rem;
}

.empty-chat {
  margin: auto;
  text-align: center;
}

.bubble {
  max-width: 85%;
  justify-self: start;
  padding: 0.55rem 0.75rem;
  border-radius: 12px 12px 12px 4px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--line);
}

.bubble.mine {
  justify-self: end;
  border-radius: 12px 12px 4px 12px;
  background: rgba(184, 224, 200, 0.55);
}

.bubble-meta {
  display: flex;
  gap: 0.45rem;
  align-items: center;
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 0.2rem;
}

.bubble p {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.4;
  word-break: break-word;
}

.bubble .x {
  border: none;
  background: none;
  color: #a33;
  cursor: pointer;
  font-size: 0.72rem;
  margin-left: auto;
}

.chat-form {
  display: flex;
  gap: 0.5rem;
}

.chat-form input {
  flex: 1;
}

.desc {
  margin: 0.75rem 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.danger {
  color: #a33 !important;
  border-color: rgba(163, 51, 51, 0.25) !important;
}

textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  background: #fff;
}

.hint {
  margin: 0;
}

.invites {
  display: grid;
  gap: 0.75rem;
}

.card.closed {
  opacity: 0.72;
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.4rem;
}

.body {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 0.65rem;
  font-size: 0.88rem;
}

.card-actions {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  margin-top: 0.75rem;
}

.link-del {
  border: none;
  background: none;
  color: #a33;
  cursor: pointer;
  font-size: 0.85rem;
}

.status.open {
  background: #fff1df;
  color: #a85a1a;
}

.status.closed {
  background: #e6e6e6;
  color: #555;
}

.members ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.members li {
  display: flex;
  gap: 0.65rem;
  justify-content: space-between;
}
</style>
