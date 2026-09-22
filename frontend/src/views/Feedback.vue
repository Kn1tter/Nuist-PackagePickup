<template>
  <main class="wrap">
    <div class="hero panel">
      <div>
        <h1>反馈</h1>
        <p class="muted">建议、Bug、想要的功能，直接告诉管理员。</p>
      </div>
    </div>

    <form class="panel form" @submit.prevent="submit">
      <div class="field">
        <label>写点什么</label>
        <textarea v-model="content" rows="4" maxlength="2000" placeholder="越具体越好…" required />
      </div>
      <p v-if="formError" class="err">{{ formError }}</p>
      <button class="btn" type="submit" :disabled="sending">
        {{ sending ? '提交中…' : '提交反馈' }}
      </button>
    </form>

    <section class="list">
      <h2>{{ isAdmin ? '全部反馈' : '我的反馈' }}</h2>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="loading" class="muted">加载中…</p>
      <p v-else-if="!feedbacks.length" class="muted empty">还没有反馈记录。</p>

      <article v-for="f in feedbacks" :key="f.id" class="panel card">
        <div class="meta muted">
          <span v-if="isAdmin">{{ f.nickname || '同学' }} · {{ f.student_id }}</span>
          <span>{{ formatTime(f.created_at) }}</span>
          <span class="status" :class="f.status">{{ f.status === 'done' ? '已回复' : '待处理' }}</span>
        </div>
        <p class="body">{{ f.content }}</p>
        <div v-if="f.admin_reply" class="reply">
          <strong>管理员回复</strong>
          <p>{{ f.admin_reply }}</p>
        </div>
        <form v-else-if="isAdmin" class="reply-form" @submit.prevent="reply(f)">
          <textarea v-model="drafts[f.id]" rows="2" placeholder="回复这条反馈…" required />
          <button class="btn" type="submit" :disabled="replyingId === f.id">
            {{ replyingId === f.id ? '发送中…' : '回复' }}
          </button>
        </form>
      </article>
    </section>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { request } from '../api/request'

const feedbacks = ref([])
const isAdmin = ref(false)
const loading = ref(true)
const error = ref('')
const content = ref('')
const formError = ref('')
const sending = ref(false)
const drafts = reactive({})
const replyingId = ref(null)

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16)
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/inbox/feedback')
    feedbacks.value = data.feedbacks || []
    isAdmin.value = !!data.is_admin
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function submit() {
  sending.value = true
  formError.value = ''
  try {
    await request('/inbox/feedback', { method: 'POST', body: { content: content.value } })
    content.value = ''
    await load()
  } catch (e) {
    formError.value = e.message
  } finally {
    sending.value = false
  }
}

async function reply(f) {
  replyingId.value = f.id
  try {
    await request(`/inbox/feedback/${f.id}/reply`, {
      method: 'POST',
      body: { reply: drafts[f.id] },
    })
    drafts[f.id] = ''
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    replyingId.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.wrap {
  display: grid;
  gap: 1rem;
}

.hero,
.form,
.card {
  padding: 1.2rem 1.3rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.hero p {
  margin: 0.35rem 0 0;
}

textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  background: #fff;
}

.list {
  display: grid;
  gap: 0.75rem;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-bottom: 0.55rem;
  font-size: 0.88rem;
  align-items: center;
}

.body {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}

.reply {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 12px;
  background: rgba(31, 122, 77, 0.08);
}

.reply p {
  margin: 0.35rem 0 0;
  white-space: pre-wrap;
}

.reply-form {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.5rem;
}

.status.open {
  background: #fff1df;
  color: #a85a1a;
}

.status.done {
  background: #e4efe8;
  color: var(--accent);
}

.empty {
  padding: 1rem 0;
}
</style>
