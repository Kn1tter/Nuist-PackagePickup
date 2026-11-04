<template>
  <main class="panel page">
    <div class="head">
      <div>
        <h1>用户管理</h1>
        <p class="muted">搜索学号或昵称，重置密码 / 删除账号</p>
      </div>
      <RouterLink class="btn ghost" to="/profile">返回</RouterLink>
    </div>

    <section v-if="server" class="server-card">
      <div class="server-head">
        <strong>服务器状态</strong>
        <button type="button" class="btn ghost sm" :disabled="serverLoading" @click="loadServer">
          {{ serverLoading ? '…' : '刷新' }}
        </button>
      </div>
      <p class="server-online">
        当前在线 <strong>{{ server.online }}</strong> 人
        <span class="muted">（{{ server.onlineTtlSec }}s 无活动视为离线）</span>
      </p>
      <p class="muted server-meta">
        运行 {{ formatUptime(server.uptimeSec) }} · 内存 RSS {{ server.memory?.rssMb ?? '—' }} MB · Heap
        {{ server.memory?.heapMb ?? '—' }} MB
      </p>
      <ul v-if="arcadeLines.length" class="arcade-lines">
        <li v-for="line in arcadeLines" :key="line">{{ line }}</li>
      </ul>
      <details v-if="server.onlineUsers?.length" class="online-list">
        <summary>在线名单（最多 100）</summary>
        <ul>
          <li v-for="u in server.onlineUsers" :key="u.userId">
            {{ u.nickname || '同学' }}
            <span class="muted">{{ u.student_id }} · 空闲 {{ u.idleSec }}s · {{ u.via }}</span>
          </li>
        </ul>
      </details>
    </section>
    <p v-else-if="serverError" class="err">{{ serverError }}</p>

    <form class="search" @submit.prevent="load">
      <input v-model="q" placeholder="学号 / 昵称" autocomplete="off" />
      <button class="btn" type="submit" :disabled="loading">{{ loading ? '…' : '搜索' }}</button>
    </form>

    <p v-if="msg" class="ok">{{ msg }}</p>
    <p v-if="error" class="err">{{ error }}</p>

    <ul class="users">
      <li v-for="u in users" :key="u.id">
        <div class="info">
          <strong>{{ u.nickname || '同学' }}</strong>
          <span class="muted">{{ u.student_id }}</span>
          <span v-if="u.is_admin" class="tag">管理员</span>
        </div>
        <div class="actions">
          <button
            type="button"
            class="btn ghost sm"
            :disabled="busyId === u.id || u.is_admin"
            @click="resetPwd(u)"
          >
            重置密码
          </button>
          <button
            type="button"
            class="btn danger ghost sm"
            :disabled="busyId === u.id || u.is_admin || isSelf(u)"
            @click="remove(u)"
          >
            删除
          </button>
        </div>
      </li>
    </ul>
    <p v-if="!loading && !users.length" class="muted empty">没有匹配用户</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { getUser, request } from '../api/request'

const router = useRouter()
const me = ref(getUser())
const q = ref('')
const users = ref([])
const loading = ref(false)
const busyId = ref(null)
const error = ref('')
const msg = ref('')
const server = ref(null)
const serverLoading = ref(false)
const serverError = ref('')

const arcadeLines = computed(() => {
  const a = server.value?.arcade
  if (!a) return []
  const label = { pool: '台球', skull: '骷髅', tank: '坦克', dino: '恐龙', curling: '冰壶' }
  return Object.entries(label).map(([k, name]) => {
    const s = a[k] || {}
    return `${name}：等待 ${s.waiting ?? 0} · 对局 ${s.playing ?? 0} · 房间 ${s.rooms ?? 0}`
  })
})

function isSelf(u) {
  return Number(u.id) === Number(me.value?.id)
}

function formatUptime(sec) {
  const n = Math.max(0, Number(sec) || 0)
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = n % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

async function ensureAdmin() {
  try {
    const data = await request('/auth/me')
    me.value = data.user
    if (!data.user?.is_admin) {
      router.replace('/profile')
      return false
    }
    return true
  } catch {
    router.replace('/login')
    return false
  }
}

async function loadServer() {
  serverLoading.value = true
  serverError.value = ''
  try {
    server.value = await request('/admin/server')
  } catch (e) {
    serverError.value = e.message || '加载服务器状态失败'
    server.value = null
  } finally {
    serverLoading.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  msg.value = ''
  try {
    const qs = q.value.trim() ? `?q=${encodeURIComponent(q.value.trim())}` : ''
    const data = await request(`/admin/users${qs}`)
    users.value = data.users || []
  } catch (e) {
    error.value = e.message
    users.value = []
  } finally {
    loading.value = false
  }
}

async function resetPwd(u) {
  const next = window.prompt(
    `重置 ${u.nickname || u.student_id} 的密码\n直接点确定 → 设为 123456\n或输入自定义密码（至少 6 位）`,
    '123456'
  )
  if (next == null) return
  const password = String(next).trim() || '123456'
  if (password.length < 6) {
    error.value = '密码至少 6 位'
    return
  }
  if (!window.confirm(`确认把 ${u.student_id} 的密码重置为「${password}」？`)) return

  busyId.value = u.id
  error.value = ''
  msg.value = ''
  try {
    await request(`/admin/users/${u.student_id}/reset-password`, {
      method: 'POST',
      body: { password },
    })
    msg.value = `已重置 ${u.student_id} → ${password}`
  } catch (e) {
    error.value = e.message
  } finally {
    busyId.value = null
  }
}

async function remove(u) {
  if (
    !window.confirm(
      `确定删除用户 ${u.nickname || ''}（${u.student_id}）？\n订单、帖子、消息等关联数据会一并清理，不可恢复。`
    )
  ) {
    return
  }
  busyId.value = u.id
  error.value = ''
  msg.value = ''
  try {
    await request(`/admin/users/${u.student_id}`, { method: 'DELETE' })
    msg.value = `已删除 ${u.student_id}`
    users.value = users.value.filter((x) => x.id !== u.id)
  } catch (e) {
    error.value = e.message
  } finally {
    busyId.value = null
  }
}

onMounted(async () => {
  if (!(await ensureAdmin())) return
  await Promise.all([load(), loadServer()])
})
</script>

<style scoped>
.page {
  padding: 1.4rem;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.server-card {
  margin: 0 0 1rem;
  padding: 0.95rem 1.05rem;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: linear-gradient(145deg, rgba(232, 242, 236, 0.9), rgba(255, 255, 255, 0.92));
}

.server-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.45rem;
}

.server-online {
  margin: 0;
  font-size: 1.05rem;
}

.server-online strong {
  font-size: 1.35rem;
  color: var(--accent, #1f7a4d);
}

.server-meta {
  margin: 0.35rem 0 0;
  font-size: 0.86rem;
}

.arcade-lines {
  margin: 0.55rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.2rem;
  font-size: 0.86rem;
  color: var(--muted);
}

.online-list {
  margin-top: 0.55rem;
  font-size: 0.88rem;
}

.online-list ul {
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
  max-height: 220px;
  overflow: auto;
}

.online-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  padding: 0.3rem 0.45rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

.head .muted {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
}

.search {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.search input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.65rem 1rem;
  background: #fff;
}

.users {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
}

.users li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.info {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.65rem;
  min-width: 0;
}

.actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.4rem;
}

.sm {
  padding: 0.4rem 0.75rem;
  font-size: 0.86rem;
}

.btn.danger {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.35);
}

.tag {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(196, 92, 38, 0.15);
  color: var(--accent-2);
  font-size: 0.75rem;
  font-weight: 700;
}

.ok {
  color: var(--accent);
  font-weight: 600;
  font-size: 0.9rem;
}

.err {
  color: #c0392b;
  font-size: 0.9rem;
}

.empty {
  margin-top: 0.5rem;
}

@media (max-width: 560px) {
  .users li {
    flex-direction: column;
    align-items: stretch;
  }

  .actions {
    justify-content: flex-end;
  }
}
</style>
