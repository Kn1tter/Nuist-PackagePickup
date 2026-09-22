<template>
  <main>
    <div class="hero panel">
      <div>
        <h1>消息</h1>
        <p class="muted">系统通知 · 反馈回复 · 全站公告</p>
      </div>
      <button v-if="messages.some((m) => !m.is_read)" class="btn ghost" type="button" @click="readAll">
        全部已读
      </button>
    </div>

    <section v-if="isAdmin" class="panel announce">
      <h2>全站公告</h2>
      <p class="tip muted">仅管理员可见。发送后所有用户都会在消息里收到，类似群公告。</p>
      <form class="form" @submit.prevent="sendAnnounce">
        <div class="field">
          <label>标题</label>
          <input v-model="announce.title" maxlength="80" placeholder="例如：本周末代拿活动说明" required />
        </div>
        <div class="field">
          <label>正文</label>
          <textarea
            v-model="announce.body"
            rows="4"
            maxlength="2000"
            placeholder="写给全体用户的公告内容…"
            required
          />
        </div>
        <div class="field">
          <label>跳转链接（可选）</label>
          <input v-model="announce.link" maxlength="200" placeholder="/forum 或留空" />
        </div>
        <p v-if="announceError" class="err">{{ announceError }}</p>
        <p v-if="announceOk" class="ok">{{ announceOk }}</p>
        <button class="btn" type="submit" :disabled="sending">
          {{ sending ? '发送中…' : '发送给全体用户' }}
        </button>
      </form>
    </section>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载中…</p>
    <p v-else-if="!messages.length" class="empty muted">暂无消息。</p>

    <div class="list">
      <article
        v-for="m in messages"
        :key="m.id"
        class="panel card"
        :class="{ unread: !m.is_read, announcement: isAnnouncement(m) }"
        @click="open(m)"
      >
        <div class="top">
          <strong>{{ m.title }}</strong>
          <span class="muted">{{ formatTime(m.created_at) }}</span>
        </div>
        <p>{{ m.body }}</p>
        <span v-if="!m.is_read" class="dot">未读</span>
      </article>
    </div>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '../api/request'

const router = useRouter()
const messages = ref([])
const isAdmin = ref(false)
const loading = ref(true)
const error = ref('')
const sending = ref(false)
const announceError = ref('')
const announceOk = ref('')
const announce = reactive({
  title: '',
  body: '',
  link: '',
})

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function isAnnouncement(m) {
  return String(m.title || '').includes('【全站公告】')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/inbox/messages')
    messages.value = data.messages || []
    isAdmin.value = !!data.is_admin
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function sendAnnounce() {
  sending.value = true
  announceError.value = ''
  announceOk.value = ''
  try {
    const data = await request('/inbox/announce', {
      method: 'POST',
      body: {
        title: announce.title,
        body: announce.body,
        link: announce.link || undefined,
      },
    })
    announceOk.value = `已发送给 ${data.count} 位用户`
    announce.title = ''
    announce.body = ''
    announce.link = ''
    await load()
    window.dispatchEvent(new CustomEvent('nuist-unread-refresh'))
  } catch (e) {
    announceError.value = e.message
  } finally {
    sending.value = false
  }
}

async function open(m) {
  if (!m.is_read) {
    try {
      await request(`/inbox/messages/${m.id}/read`, { method: 'POST' })
      m.is_read = true
      window.dispatchEvent(new CustomEvent('nuist-unread-refresh'))
    } catch {
      /* ignore */
    }
  }
  if (m.link) router.push(m.link)
}

async function readAll() {
  try {
    await request('/inbox/messages/read-all', { method: 'POST' })
    messages.value = messages.value.map((m) => ({ ...m, is_read: true }))
    window.dispatchEvent(new CustomEvent('nuist-unread-refresh'))
  } catch (e) {
    error.value = e.message
  }
}

onMounted(load)
</script>

<style scoped>
.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.4rem;
  margin-bottom: 1rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

.hero p {
  margin: 0.35rem 0 0;
}

.announce {
  padding: 1.2rem 1.3rem;
  margin-bottom: 1rem;
}

.announce h2 {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
}

.tip {
  margin: 0 0 0.85rem;
  font-size: 0.88rem;
}

.form {
  display: grid;
  gap: 0.75rem;
}

.ok {
  margin: 0;
  color: var(--accent);
  font-weight: 600;
}

.list {
  display: grid;
  gap: 0.75rem;
}

.card {
  padding: 1.05rem 1.15rem;
  cursor: pointer;
  position: relative;
  transition: transform 0.15s ease;
}

.card:hover {
  transform: translateY(-2px);
}

.card.unread {
  border-color: rgba(31, 122, 77, 0.35);
  background: rgba(255, 255, 255, 0.92);
}

.card.announcement {
  border-color: rgba(196, 120, 40, 0.35);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(255, 236, 210, 0.45));
}

.top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
  flex-wrap: wrap;
}

.card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.45;
}

.dot {
  position: absolute;
  top: 0.85rem;
  right: 1rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-2);
}

.empty {
  padding: 2rem 0;
  text-align: center;
}

@media (max-width: 640px) {
  .hero {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
