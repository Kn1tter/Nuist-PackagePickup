<template>
  <main>
    <div class="hero panel">
      <div>
        <h1>订单大厅</h1>
        <p class="muted">待接单列表 · 接单后才能看完整取件码与单号</p>
      </div>
      <RouterLink class="btn" to="/post">我要发单</RouterLink>
    </div>

    <div v-if="companies.length" class="filters panel">
      <button
        class="chip"
        type="button"
        :class="{ on: !filterCompany }"
        @click="filterCompany = ''"
      >
        全部
      </button>
      <button
        v-for="c in companies"
        :key="c"
        class="chip"
        type="button"
        :class="{ on: filterCompany === c }"
        @click="filterCompany = c"
      >
        {{ c }}
      </button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载中…</p>
    <p v-else-if="!filtered.length" class="empty muted">
      {{ filterCompany ? `暂无「${filterCompany}」待接单` : '暂时没有待接单，去做第一个发单的人吧。' }}
    </p>

    <div class="list">
      <OrderCard
        v-for="(o, i) in filtered"
        :key="o.id"
        :order="o"
        :style="{ animationDelay: `${i * 0.05}s` }"
        @open="go"
      />
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import OrderCard from '../components/OrderCard.vue'
import { request } from '../api/request'

const router = useRouter()
const orders = ref([])
const loading = ref(true)
const error = ref('')
const filterCompany = ref('')

const companies = computed(() => {
  const set = new Set()
  for (const o of orders.value) {
    if (o.express_company) set.add(o.express_company)
  }
  return [...set]
})

const filtered = computed(() => {
  if (!filterCompany.value) return orders.value
  return orders.value.filter((o) => o.express_company === filterCompany.value)
})

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
  margin-bottom: 0.85rem;
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
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
}

.chip {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--text);
}

.chip.on {
  border-color: var(--accent);
  background: rgba(18, 53, 40, 0.1);
  font-weight: 600;
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
