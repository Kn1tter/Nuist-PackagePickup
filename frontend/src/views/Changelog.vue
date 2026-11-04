<template>
  <main>
    <div class="hero panel">
      <div>
        <h1>更新日志</h1>
        <p class="muted">网站功能与修复记录 · 仅管理员可发布</p>
      </div>
      <RouterLink v-if="isAdmin" class="btn" to="/changelog/new">发布更新</RouterLink>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载中…</p>
    <p v-else-if="!entries.length" class="empty muted">还没有更新记录。</p>

    <div class="list">
      <article
        v-for="(e, i) in entries"
        :key="e.id"
        class="panel post-card"
        :style="{ animationDelay: `${i * 0.04}s` }"
        @click="go(e.id)"
      >
        <h2>{{ e.title }}</h2>
        <p class="preview">{{ e.body_preview }}</p>
        <div class="meta muted">
          <span>{{ e.nickname || '管理员' }}</span>
          <span>{{ formatTime(e.created_at) }}</span>
        </div>
      </article>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { request } from '../api/request'
import { formatTime } from '../lib/time'

const router = useRouter()
const entries = ref([])
const loading = ref(true)
const error = ref('')
const isAdmin = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/changelog')
    entries.value = data.entries || []
    isAdmin.value = !!data.viewer?.is_admin
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function go(id) {
  router.push(`/changelog/${id}`)
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
  white-space: pre-wrap;
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
