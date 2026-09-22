<template>
  <main>
    <div class="hero panel">
      <div>
        <h1>订单大厅</h1>
        <p class="muted">待接单列表 · 接单后才能看完整取件码</p>
      </div>
      <RouterLink class="btn" to="/post">我要发单</RouterLink>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载中…</p>
    <p v-else-if="!orders.length" class="empty muted">暂时没有待接单，去做第一个发单的人吧。</p>

    <div class="list">
      <OrderCard
        v-for="(o, i) in orders"
        :key="o.id"
        :order="o"
        :style="{ animationDelay: `${i * 0.05}s` }"
        @open="go"
      />
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import OrderCard from '../components/OrderCard.vue'
import { request } from '../api/request'

const router = useRouter()
const orders = ref([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/orders?status=pending')
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

.empty {
  padding: 2rem 0;
  text-align: center;
}

@media (max-width: 640px) {
  .hero {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
