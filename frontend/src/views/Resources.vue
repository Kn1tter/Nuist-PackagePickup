<template>
  <main>
    <div class="hero panel">
      <div>
        <h1>资源库</h1>
        <p class="muted">课件 · 历年卷 · 网盘链接 · 同学互助分享</p>
      </div>
      <RouterLink class="btn" to="/resources/new">上传资源</RouterLink>
    </div>

    <div class="filters">
      <button
        v-for="c in ['全部', ...categories]"
        :key="c"
        type="button"
        :class="{ on: filter === c }"
        @click="setFilter(c)"
      >
        {{ c }}
      </button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载中…</p>
    <p v-else-if="!list.length" class="empty muted">还没有资源，去做第一个分享的人吧。</p>

    <div class="list">
      <article v-for="(r, i) in list" :key="r.id" class="panel card" :style="{ animationDelay: `${i * 0.04}s` }">
        <div class="top">
          <span class="cat">{{ r.category }}</span>
          <button v-if="r.can_delete" class="link-del" type="button" @click="remove(r.id)">删除</button>
        </div>
        <h2>{{ r.title }}</h2>
        <p v-if="r.description" class="desc">{{ r.description }}</p>
        <div class="meta muted">
          <span>{{ r.nickname || '同学' }}</span>
          <span>{{ formatTime(r.created_at) }}</span>
        </div>
        <a class="btn ghost open" :href="r.url" target="_blank" rel="noopener noreferrer">打开链接</a>
      </article>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { request } from '../api/request'

const resources = ref([])
const categories = ref([])
const filter = ref('全部')
const loading = ref(true)
const error = ref('')

const list = computed(() =>
  filter.value === '全部'
    ? resources.value
    : resources.value.filter((r) => r.category === filter.value)
)

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
    const data = await request('/resources')
    resources.value = data.resources || []
    categories.value = data.categories || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function setFilter(c) {
  filter.value = c
}

async function remove(id) {
  if (!confirm('确定删除这条资源？')) return
  try {
    await request(`/resources/${id}`, { method: 'DELETE' })
    resources.value = resources.value.filter((r) => r.id !== id)
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

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 1rem;
}

.filters button {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.88rem;
}

.filters button.on {
  background: var(--bg-deep);
  color: #fff;
  border-color: transparent;
}

.list {
  display: grid;
  gap: 0.85rem;
}

.card {
  padding: 1.1rem 1.2rem;
  animation: rise 0.4s ease both;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.cat {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(31, 122, 77, 0.12);
  color: var(--accent);
}

h2 {
  margin: 0.55rem 0 0.35rem;
  font-size: 1.15rem;
}

.desc {
  margin: 0;
  color: var(--muted);
  line-height: 1.45;
}

.meta {
  display: flex;
  gap: 0.75rem;
  margin: 0.7rem 0 0.85rem;
  font-size: 0.88rem;
}

.open {
  display: inline-flex;
}

.link-del {
  border: none;
  background: none;
  color: #a33;
  cursor: pointer;
  font-size: 0.85rem;
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
