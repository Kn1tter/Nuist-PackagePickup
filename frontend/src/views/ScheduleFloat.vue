<template>
  <main class="float">
    <header>
      <strong>第{{ week }}周 · 周{{ dayLabel }}</strong>
      <button type="button" @click="reload">刷新</button>
    </header>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载中…</p>
    <p v-else-if="!items.length" class="muted">这天没有课</p>
    <ul v-else>
      <li v-for="it in items" :key="it.id">
        <div class="time">{{ it.start_time }}-{{ it.end_time }}</div>
        <div class="name">{{ it.name }}</div>
        <div class="loc">{{ it.location || '地点未填' }}</div>
        <div class="line">{{ it.label }}</div>
      </li>
    </ul>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { request } from '../api/request'

const route = useRoute()
const week = ref(Number(route.query.week) || 1)
const day = ref(Number(route.query.day) || 1)
const items = ref([])
const loading = ref(true)
const error = ref('')

const dayLabel = computed(() => '一二三四五六日'[day.value - 1] || '?')

async function reload() {
  loading.value = true
  error.value = ''
  try {
    const data = await request(`/schedule/day?day=${day.value}&week=${week.value}`)
    week.value = data.week
    day.value = data.day
    items.value = data.items || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(reload)
</script>

<style scoped>
.float {
  min-height: 100vh;
  margin: 0;
  padding: 12px;
  background: linear-gradient(180deg, #0f2f24, #1a4a38);
  color: #f4fff8;
  font-family: 'DM Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

header button {
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

li {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.time {
  font-size: 0.85rem;
  opacity: 0.85;
}

.name {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 4px 0;
}

.loc {
  opacity: 0.9;
}

.line {
  margin-top: 8px;
  font-size: 0.82rem;
  opacity: 0.75;
  line-height: 1.4;
}

.muted {
  opacity: 0.7;
}

.err {
  color: #ffb4b4;
}
</style>
