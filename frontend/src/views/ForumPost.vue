<template>
  <main v-if="post" class="wrap">
    <article class="panel post">
      <div class="head">
        <div>
          <h1>{{ post.title }}</h1>
          <p class="muted">
            {{ post.nickname || '同学' }} · Lv.{{ post.level || 1 }} · {{ formatTime(post.created_at) }}
            <span v-if="viewer.is_admin" class="badge">管理员视角</span>
          </p>
        </div>
        <button v-if="post.can_delete" class="btn ghost danger" type="button" @click="removePost">
          删除帖子
        </button>
      </div>
      <p class="body">{{ post.body }}</p>
      <div class="actions">
        <button
          type="button"
          class="like-btn"
          :class="{ on: post.liked_by_me }"
          :disabled="liking"
          @click="toggleLike"
        >
          {{ post.liked_by_me ? '已赞' : '点赞' }} · {{ post.like_count || 0 }}
        </button>
        <span v-if="xpTip" class="xp-tip">{{ xpTip }}</span>
      </div>
    </article>

    <section class="panel replies">
      <h2>回复 {{ replies.length }}</h2>
      <div v-for="r in replies" :key="r.id" class="reply">
        <div class="reply-top">
          <strong>{{ r.nickname || '同学' }}</strong>
          <span class="lv muted">Lv.{{ r.level || 1 }}</span>
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
import { request, requireMember } from '../api/request'
import { formatTime } from '../lib/time'

const route = useRoute()
const router = useRouter()
const post = ref(null)
const replies = ref([])
const viewer = ref({ is_admin: false })
const replyBody = ref('')
const sending = ref(false)
const liking = ref(false)
const error = ref('')
const xpTip = ref('')

function showXp(gained, info) {
  if (!gained || !info) return
  xpTip.value = `+${gained} 经验 · 当前 Lv.${info.level}`
  window.setTimeout(() => {
    if (xpTip.value.startsWith(`+${gained}`)) xpTip.value = ''
  }, 2800)
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
  if (!requireMember(router)) return
  sending.value = true
  error.value = ''
  try {
    const data = await request(`/forum/posts/${route.params.id}/replies`, {
      method: 'POST',
      body: { body: replyBody.value },
    })
    replies.value.push({ ...data.reply, can_delete: true })
    replyBody.value = ''
    showXp(data.xp_gained, data.xp)
  } catch (e) {
    error.value = e.message
  } finally {
    sending.value = false
  }
}

async function toggleLike() {
  if (!requireMember(router)) return
  liking.value = true
  error.value = ''
  try {
    const data = await request(`/forum/posts/${route.params.id}/like`, { method: 'POST' })
    post.value = {
      ...post.value,
      liked_by_me: !!data.liked,
      like_count: Number(data.like_count || 0),
    }
  } catch (e) {
    error.value = e.message
  } finally {
    liking.value = false
  }
}

async function removePost() {
  if (!requireMember(router)) return
  if (!confirm('确定删除这篇帖子？')) return
  try {
    await request(`/forum/posts/${route.params.id}`, { method: 'DELETE' })
    router.replace('/forum')
  } catch (e) {
    error.value = e.message
  }
}

async function removeReply(id) {
  if (!requireMember(router)) return
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

.actions {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.like-btn {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
  color: var(--ink);
}

.like-btn.on {
  background: rgba(196, 92, 38, 0.12);
  border-color: rgba(196, 92, 38, 0.35);
  color: var(--accent-2);
}

.xp-tip {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--accent);
}

.lv {
  font-size: 0.85rem;
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
