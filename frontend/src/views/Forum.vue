<template>
  <main>
    <div class="hero panel">
      <div>
        <h1>校园论坛</h1>
        <p class="muted">交流 · 求助 · 反馈 · Make NUIST Better</p>
      </div>
      <RouterLink class="btn" to="/forum/new">发帖</RouterLink>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载中…</p>
    <p v-else-if="!posts.length" class="empty muted">还没有帖子，去做第一个发声的人吧。</p>

    <div class="list">
      <article
        v-for="(p, i) in posts"
        :key="p.id"
        class="panel post-card"
        :style="{ animationDelay: `${i * 0.04}s` }"
        @click="go(p.id)"
      >
        <h2>{{ p.title }}</h2>
        <p class="preview">{{ p.body_preview }}</p>
        <div class="meta muted">
          <span>{{ p.nickname || '同学' }}</span>
          <span>{{ formatTime(p.created_at) }}</span>
          <span>{{ p.reply_count }} 回复</span>
        </div>
      </article>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '../api/request'

const router = useRouter()
const posts = ref([])
const loading = ref(true)
const error = ref('')

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
    const data = await request('/forum/posts')
    posts.value = data.posts || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function go(id) {
  router.push(`/forum/${id}`)
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
  margin-bottom: 1.1rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

.hero p {
  margin: 0.35rem 0 0;
}

.list {
  display: grid;
  gap: 0.85rem;
}

.post-card {
  padding: 1.1rem 1.2rem;
  cursor: pointer;
  animation: rise 0.4s ease both;
  transition: transform 0.15s ease;
}

.post-card:hover {
  transform: translateY(-2px);
}

.post-card h2 {
  margin: 0 0 0.45rem;
  font-size: 1.15rem;
}

.preview {
  margin: 0;
  color: var(--muted);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.75rem;
  font-size: 0.88rem;
}

.empty {
  padding: 2rem 0;
  text-align: center;
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
  .hero {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
