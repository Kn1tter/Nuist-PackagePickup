<template>
  <section class="board panel">
    <div class="head">
      <h2>{{ title }}</h2>
      <div v-if="tabs.length > 1" class="tabs" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="game === t.id"
          :class="{ on: game === t.id }"
          @click="switchGame(t.id)"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <div class="body" :style="{ minHeight: bodyMinHeight }">
      <div v-if="loading && !rows.length" class="state muted">加载中…</div>
      <div v-else-if="error && !rows.length" class="state err">{{ error }}</div>
      <ol v-else-if="rows.length" class="list" :class="{ dim: loading }">
        <li v-for="(r, i) in rows" :key="`${r.user_id}-${r.game}`">
          <span class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
          <div class="who">
            <strong>{{ r.nickname }}</strong>
            <span class="sig">{{ r.signature || ' ' }}</span>
          </div>
          <div v-if="scoreMode" class="nums">
            <span class="w">最高 {{ r.best_score }}</span>
          </div>
          <div v-else class="nums">
            <span class="w">胜 {{ r.wins }}</span>
            <span>负 {{ r.losses }}</span>
            <span class="f">逃 {{ r.flees }}</span>
          </div>
        </li>
        <!-- 占位行：保证切换榜时高度稳定 -->
        <li v-for="n in padCount" :key="`pad-${n}`" class="pad" aria-hidden="true">
          <span class="rank">·</span>
          <div class="who">
            <strong>&nbsp;</strong>
            <span class="sig">&nbsp;</span>
          </div>
          <div class="nums">
            <span>&nbsp;</span>
          </div>
        </li>
      </ol>
      <div v-else class="state muted">{{ scoreMode ? '暂无成绩，跑一局吧' : '暂无战绩，开一局吧' }}</div>
      <div v-if="loading && rows.length" class="veil" aria-hidden="true" />
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { request } from '../api/request'

const props = defineProps({
  title: { type: String, default: '小游戏排行榜' },
  initialGame: { type: String, default: 'all' },
  limit: { type: Number, default: 10 },
  only: { type: String, default: '' },
})

const allTabs = [
  { id: 'all', label: '总榜' },
  { id: 'pool', label: '台球' },
  { id: 'skull', label: '骷髅牌' },
  { id: 'tank', label: '坦克' },
  { id: 'curling', label: '冰壶' },
  { id: 'dino', label: '小恐龙' },
]

const tabs = computed(() => (props.only ? allTabs.filter((t) => t.id === props.only) : allTabs))

const known = new Set(allTabs.map((t) => t.id))
const game = ref(known.has(props.only) ? props.only : known.has(props.initialGame) ? props.initialGame : 'all')
const scoreMode = computed(() => game.value === 'dino')
const rows = ref([])
const loading = ref(false)
const error = ref('')

const padCount = computed(() => Math.max(0, props.limit - rows.value.length))
const bodyMinHeight = computed(() => `${Math.max(props.limit, 1) * 3.05 + 0.2}rem`)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await request(`/arcade/leaderboard?game=${game.value}&limit=${props.limit}`)
    rows.value = data.leaderboard || []
  } catch (e) {
    error.value = e.message
    // 保留旧数据，避免高度塌陷
  } finally {
    loading.value = false
  }
}

function switchGame(id) {
  if (game.value === id || loading.value) return
  game.value = id
  load()
}

onMounted(load)

defineExpose({ reload: load })
</script>

<style scoped>
.board {
  padding: 1.15rem 1.2rem 1.25rem;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.85rem;
}

h2 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.35rem;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  flex-shrink: 0;
}

.tabs button {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.28rem 0.7rem;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
}

.tabs button.on {
  background: var(--bg-deep);
  color: #fff;
  border-color: transparent;
}

.tabs button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.body {
  position: relative;
  display: flex;
  flex-direction: column;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
  transition: opacity 0.15s ease;
}

.list.dim {
  opacity: 0.55;
}

.list li {
  display: grid;
  grid-template-columns: 1.6rem 1fr auto;
  gap: 0.55rem;
  align-items: center;
  padding: 0.55rem 0.65rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line);
  min-height: 2.6rem;
  box-sizing: border-box;
}

.list li.pad {
  visibility: hidden;
  pointer-events: none;
  border-color: transparent;
  background: transparent;
}

.rank {
  font-weight: 800;
  color: var(--muted);
  text-align: center;
}

.rank.top {
  color: var(--accent-2);
}

.who {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.who strong {
  font-size: 0.95rem;
  line-height: 1.2;
}

.sig {
  font-size: 0.78rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
  min-height: 1em;
}

.nums {
  display: flex;
  gap: 0.55rem;
  font-size: 0.78rem;
  color: var(--muted);
  white-space: nowrap;
}

.nums .w {
  color: var(--accent);
  font-weight: 700;
}

.nums .f {
  color: #b42318;
}

.state {
  margin: 0;
  padding: 0.75rem 0.2rem;
  font-size: 0.9rem;
}

.err {
  color: #c0392b;
}

.veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
