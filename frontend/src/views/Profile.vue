<template>
  <main class="panel profile">
    <h1>我的</h1>
    <p v-if="user" class="muted">学号 {{ user.student_id }} · 信用 {{ user.credit_score }}</p>

    <div class="stats" v-if="user">
      <div>
        <strong>{{ user.nickname || '同学' }}</strong>
        <span class="muted">昵称</span>
      </div>
      <div>
        <strong>{{ user.phone }}</strong>
        <span class="muted">手机</span>
      </div>
    </div>

    <div class="tabs">
      <button :class="{ on: tab === 'posted' }" type="button" @click="switchTab('posted')">我发的</button>
      <button :class="{ on: tab === 'accepted' }" type="button" @click="switchTab('accepted')">我接的</button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <div class="list">
      <OrderCard v-for="o in orders" :key="o.id" :order="o" @open="go" />
      <p v-if="!loading && !orders.length" class="muted">暂无记录</p>
    </div>

    <button class="btn ghost logout" type="button" @click="logout">退出登录</button>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import OrderCard from '../components/OrderCard.vue'
import { clearSession, getUser, request } from '../api/request'

const router = useRouter()
const user = ref(getUser())
const tab = ref('posted')
const orders = ref([])
const loading = ref(false)
const error = ref('')

async function refreshMe() {
  try {
    const data = await request('/auth/me')
    user.value = data.user
  } catch {
    /* ignore */
  }
}

async function switchTab(next) {
  tab.value = next
  loading.value = true
  error.value = ''
  try {
    const data = await request(`/orders?mine=${next}`)
    orders.value = data.orders || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function go(order) {
  router.push(`/orders/${order.id}`)
}

function logout() {
  clearSession()
  router.replace('/login')
}

onMounted(async () => {
  await refreshMe()
  await switchTab('posted')
})
</script>

<style scoped>
.profile {
  padding: 1.4rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin: 1rem 0;
}

.stats div {
  padding: 0.9rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tabs button {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  font-weight: 600;
}

.tabs button.on {
  background: var(--bg-deep);
  color: #fff;
  border-color: transparent;
}

.list {
  display: grid;
  gap: 0.75rem;
}

.logout {
  margin-top: 1.4rem;
}
</style>
