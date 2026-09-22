<template>
  <main v-if="order" class="panel detail">
    <div class="head">
      <div>
        <h1>{{ order.dorm_building }}</h1>
        <span class="status" :class="order.status">{{ statusText }}</span>
      </div>
      <strong class="reward">¥{{ Number(order.reward).toFixed(1) }}</strong>
    </div>

    <dl class="facts">
      <div><dt>快递</dt><dd>{{ order.express_company || '未填写' }}</dd></div>
      <div><dt>尺寸</dt><dd>{{ sizeText }}</dd></div>
      <div><dt>尾号</dt><dd>{{ order.phone_last4 }}</dd></div>
      <div><dt>你的角色</dt><dd>{{ roleText }}</dd></div>
    </dl>

    <section class="code-box">
      <h2>取件码</h2>
      <p v-if="!order.can_reveal_code && order.role !== 'courier'" class="muted-light">
        {{ order.pickup_code ? `脱敏：${order.pickup_code}` : '接单后由骑手查看完整取件码' }}
      </p>
      <template v-else>
        <p class="code">{{ revealed || order.pickup_code || '••••' }}</p>
        <button
          v-if="order.can_reveal_code && !revealed"
          class="btn ghost light"
          type="button"
          @click="revealCode"
        >
          查看完整取件码
        </button>
      </template>
    </section>

    <p v-if="error" class="err">{{ error }}</p>

    <div class="actions">
      <button
        v-if="order.status === 'pending' && order.role === 'other'"
        class="btn"
        type="button"
        :disabled="busy"
        @click="accept"
      >
        接单
      </button>
      <button
        v-if="order.role === 'courier' && order.status === 'accepted'"
        class="btn"
        type="button"
        :disabled="busy"
        @click="setStatus('picked')"
      >
        已取件
      </button>
      <button
        v-if="order.role === 'courier' && order.status === 'picked'"
        class="btn"
        type="button"
        :disabled="busy"
        @click="setStatus('delivered')"
      >
        已送达
      </button>
      <button
        v-if="order.role === 'owner' && order.status === 'delivered'"
        class="btn"
        type="button"
        :disabled="busy"
        @click="setStatus('done', true)"
      >
        确认收货（线下已付）
      </button>
      <button
        v-if="['pending', 'accepted'].includes(order.status) && order.role !== 'other'"
        class="btn warn"
        type="button"
        :disabled="busy"
        @click="setStatus('cancelled')"
      >
        取消订单
      </button>
    </div>
  </main>
  <p v-else-if="loading" class="muted">加载中…</p>
  <p v-else class="err">{{ error || '订单不存在' }}</p>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { request } from '../api/request'

const route = useRoute()
const order = ref(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const revealed = ref('')

const map = {
  pending: '待接单',
  accepted: '已接单',
  picked: '已取件',
  delivered: '已送达',
  done: '已完成',
  cancelled: '已取消',
}
const sizeMap = { small: '小件', medium: '中件', large: '大件' }
const roleMap = { owner: '发单人', courier: '接单人', other: '访客' }

const statusText = computed(() => map[order.value?.status] || '')
const sizeText = computed(() => sizeMap[order.value?.package_size] || '')
const roleText = computed(() => roleMap[order.value?.role] || '')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await request(`/orders/${route.params.id}`)
    order.value = data.order
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function accept() {
  busy.value = true
  error.value = ''
  try {
    const data = await request(`/orders/${route.params.id}/accept`, { method: 'POST' })
    order.value = data.order
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function revealCode() {
  error.value = ''
  try {
    const data = await request(`/orders/${route.params.id}?reveal=1`)
    revealed.value = data.order.pickup_code
    order.value = { ...order.value, ...data.order, pickup_code: data.order.pickup_code }
  } catch (e) {
    error.value = e.message
  }
}

async function setStatus(status, paid_offline = false) {
  busy.value = true
  error.value = ''
  try {
    const data = await request(`/orders/${route.params.id}/status`, {
      method: 'POST',
      body: { status, paid_offline },
    })
    order.value = data.order
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.detail {
  padding: 1.4rem;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

h1 {
  margin: 0 0 0.5rem;
  font-family: var(--display);
  font-size: 1.9rem;
}

.reward {
  font-size: 1.6rem;
  color: var(--accent-2);
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1.2rem 0;
}

.facts div {
  padding: 0.75rem 0.9rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--line);
}

dt {
  font-size: 0.78rem;
  color: var(--muted);
}

dd {
  margin: 0.25rem 0 0;
  font-weight: 600;
}

.code-box {
  padding: 1rem;
  border-radius: 16px;
  background: #123528;
  color: #e7f5ee;
  margin-bottom: 1rem;
}

.code-box h2 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  opacity: 0.85;
}

.muted-light {
  opacity: 0.8;
}

.code {
  margin: 0 0 0.75rem;
  font-size: 1.6rem;
  letter-spacing: 0.12em;
  font-weight: 700;
}

.btn.light {
  color: #e7f5ee;
  border-color: rgba(231, 245, 238, 0.35);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}
</style>
