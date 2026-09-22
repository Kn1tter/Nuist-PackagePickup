<template>
  <main v-if="post" class="wrap">
    <article class="panel post">
      <div class="head">
        <div>
          <h1>{{ post.title }}</h1>
          <p class="muted">
            {{ post.nickname || '同学' }} · {{ formatTime(post.created_at) }}
            <span v-if="viewer.is_admin" class="badge">管理员视角</span>
          </p>
        </div>
        <button v-if="post.can_delete" class="btn ghost danger" type="button" @click="removePost">
          删除帖子
        </button>
      </div>
      <p class="body">{{ post.body }}</p>
    </article>

    <section class="panel replies">
      <h2>回复 {{ replies.length }}</h2>
      <div v-for="r in replies" :key="r.id" class="reply">
        <div class="reply-top">
          <strong>{{ r.nickname || '同学' }}</strong>
          <span class="muted">{{ formatTime(r.created_at) }}</span>
          <button v-if="r.can_delete" class="link-del" type="button" @click="removeReply(r.id)">
            删除
          </button>
        </div>
        <p>{{ r.body }}</p>
      </div>
      <p v-if="!replies.length" class="muted">还没有回复，说两句吧。</p>

      <form class="reply-form" @submit.prevent="sendReply">
        <textarea v-model="replyBody" rows="3" maxlength="2000" placeholder="写下你的回复…" required />
        <p v-if="error" class="err">{{ error }}</p>
        <button class="btn" type="submit" :disabled="sending">
          {{ sending ? '发送中…' : '发表回复' }}
        </button>
      </form>
    </section>
  </main>
  <p v-else-if="error" class="err">{{ error }}</p>
  <p v-else class="muted">加载中…</p>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request } from '../api/request'

const route = useRoute()
const router = useRouter()
const post = ref(null)
const replies = ref([])
const viewer = ref({ is_admin: false })
const replyBody = ref('')
const sending = ref(false)
const error = ref('')

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16)
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  error.value = ''
  try {
    const data = await request(`/forum/posts/${route.params.id}`)
    post.value = data.post
    replies.value = data.replies || []
    viewer.value = data.viewer || { is_admin: false }
  } catch (e) {
    error.value = e.message
  }
}

async function sendReply() {
  sending.value = true
  error.value = ''
  try {
    const data = await request(`/forum/posts/${route.params.id}/replies`, {
      method: 'POST',
      body: { body: replyBody.value },
    })
    replies.value.push({ ...data.reply, can_delete: true })
    replyBody.value = ''
  } catch (e) {
    error.value = e.message
  } finally {
    sending.value = false
  }
}

async function removePost() {
  if (!confirm('确定删除这篇帖子？')) return
  try {
    await request(`/forum/posts/${route.params.id}`, { method: 'DELETE' })
    router.replace('/forum')
  } catch (e) {
    error.value = e.message
  }
}

async function removeReply(id) {
  if (!confirm('确定删除这条回复？')) return
  try {
    await request(`/forum/replies/${id}`, { method: 'DELETE' })
    replies.value = replies.value.filter((r) => r.id !== id)
  } catch (e) {
    error.value = e.message
  }
}

onMounted(load)
</script>

<style scoped>
.wrap {
  display: grid;
  gap: 1rem;
}

.post,
.replies {
  padding: 1.25rem 1.35rem;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.7rem;
}

h2 {
  margin: 0 0 0.9rem;
  font-size: 1.1rem;
}

.body {
  margin: 1rem 0 0;
  white-space: pre-wrap;
  line-height: 1.6;
}

.badge {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: rgba(196, 92, 38, 0.15);
  color: var(--accent-2);
  font-size: 0.78rem;
  font-weight: 700;
}

.danger {
  color: #a33 !important;
  border-color: rgba(163, 51, 51, 0.25) !important;
}

.reply {
  padding: 0.85rem 0;
  border-top: 1px solid var(--line);
}

.reply-top {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  margin-bottom: 0.35rem;
  flex-wrap: wrap;
}

.reply p {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}

.link-del {
  border: none;
  background: none;
  color: #a33;
  cursor: pointer;
  font-size: 0.85rem;
  margin-left: auto;
}

.reply-form {
  margin-top: 1rem;
  display: grid;
  gap: 0.65rem;
}

textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  background: #fff;
}

@media (max-width: 640px) {
  .head {
    flex-direction: column;
  }
}
</style>
