<template>
  <main class="history-page">
    <header class="hero panel">
      <div>
        <p class="eyebrow">On This Day</p>
        <h1>历史上的今天</h1>
        <p class="muted">
          <template v-if="data">
            {{ data.dateLabel }} {{ data.weekday }}
            <span v-if="lunarShort"> · 农历{{ lunarShort }}</span>
          </template>
          <template v-else>完整时间线</template>
        </p>
        <p v-if="festLine" class="fest">今日：{{ festLine }}</p>
      </div>
      <RouterLink class="btn ghost" to="/hub">返回首页</RouterLink>
    </header>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载并汉化中，稍候…</p>

    <section v-else-if="events.length" class="timeline" aria-label="完整时间线">
      <div class="rail" aria-hidden="true" />
      <article
        v-for="(ev, i) in events"
        :key="i"
        class="node"
        :style="{ animationDelay: `${Math.min(i, 20) * 0.03}s` }"
      >
        <div class="dot" />
        <div class="card">
          <time class="year">{{ ev.year ? `${ev.year}年` : '同年' }}</time>
          <p class="text">{{ ev.text }}</p>
          <p v-if="ev.text_en" class="en muted">{{ ev.text_en }}</p>
        </div>
      </article>
    </section>

    <p v-else class="muted empty">暂无历史条目。</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { request } from '../api/request'

const data = ref(null)
const loading = ref(true)
const error = ref('')

const events = computed(() => {
  const list = data.value?.events
  return Array.isArray(list) ? list : []
})

const festLine = computed(() => {
  const list = data.value?.festivals
  if (!Array.isArray(list) || !list.length) {
    const jq = data.value?.jieQi
    return jq === '清明' ? '清明' : ''
  }
  return list.join(' · ')
})

const lunarShort = computed(() => {
  const raw = String(data.value?.lunarText || '').trim()
  if (!raw) return ''
  const m = raw.match(/年(.+)$/)
  return m ? m[1] : raw
})

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    data.value = await request('/hub/today')
  } catch (e) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.history-page {
  animation: rise 0.4s ease both;
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  padding: 1.25rem 1.4rem;
  margin-bottom: 1.25rem;
}

.eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.7rem, 4vw, 2.2rem);
  letter-spacing: 0.08em;
  font-weight: 600;
}

.hero .muted {
  margin: 0.4rem 0 0;
}

.fest {
  margin: 0.45rem 0 0;
  font-weight: 600;
  color: #8a3d5c;
}

.timeline {
  position: relative;
  display: grid;
  gap: 0.85rem;
  padding-left: 0.35rem;
}

.rail {
  position: absolute;
  left: 1.05rem;
  top: 0.4rem;
  bottom: 0.4rem;
  width: 2px;
  background: linear-gradient(
    180deg,
    rgba(31, 122, 77, 0.45),
    rgba(196, 92, 38, 0.35),
    rgba(163, 78, 114, 0.3)
  );
  border-radius: 2px;
}

.node {
  position: relative;
  display: grid;
  grid-template-columns: 2.1rem 1fr;
  gap: 0.7rem;
  align-items: start;
  animation: rise 0.45s ease both;
}

.dot {
  width: 0.72rem;
  height: 0.72rem;
  margin: 0.55rem auto 0;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px rgba(31, 122, 77, 0.15);
  z-index: 1;
}

.card {
  padding: 0.85rem 1rem 0.95rem;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--shadow);
}

.year {
  display: block;
  font-family: var(--display);
  font-weight: 600;
  font-size: 1.05rem;
  color: var(--accent);
  letter-spacing: 0.03em;
  margin-bottom: 0.35rem;
}

.text {
  margin: 0;
  line-height: 1.55;
  font-size: 0.95rem;
}

.en {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
}

.empty {
  margin: 1rem 0;
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
    align-items: flex-start;
  }
}
</style>
