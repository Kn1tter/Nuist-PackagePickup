<template>
  <main v-if="entry" class="wrap">
    <article class="panel post">
      <div class="head">
        <div>
          <h1>{{ entry.title }}</h1>
          <p class="muted">
            {{ entry.nickname || '管理员' }} · {{ formatTime(entry.created_at) }}
          </p>
        </div>
        <button v-if="entry.can_delete" class="btn ghost danger" type="button" @click="remove">
          删除
        </button>
      </div>
      <p class="body">{{ entry.body }}</p>
      <RouterLink class="back" to="/changelog">← 返回更新日志</RouterLink>
    </article>
  </main>
  <p v-else-if="error" class="err">{{ error }}</p>
  <p v-else class="muted">加载中…</p>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { request } from '../api/request'
import { formatTime } from '../lib/time'

const route = useRoute()
const router = useRouter()
const entry = ref(null)
const error = ref('')

async function load() {
  error.value = ''
  try {
    const data = await request(`/changelog/${route.params.id}`)
    entry.value = data.entry
  } catch (e) {
    error.value = e.message
  }
}

async function remove() {
  if (!window.confirm('确定删除这条更新日志？')) return
  try {
    await request(`/changelog/${route.params.id}`, { method: 'DELETE' })
    router.replace('/changelog')
  } catch (e) {
    error.value = e.message
  }
}

onMounted(load)
</script>

<style scoped>
.wrap {
  max-width: 720px;
}

.post {
  padding: 1.35rem 1.4rem 1.5rem;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

h1 {
  margin: 0 0 0.4rem;
  font-family: var(--display);
  font-size: 1.65rem;
}

.body {
  margin: 0 0 1.25rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.back {
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}

.danger {
  color: #c0392b;
  border-color: rgba(192, 57, 43, 0.35);
}
</style>
