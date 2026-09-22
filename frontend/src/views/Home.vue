<template>
  <main class="panel form-wrap">
    <h1>发布代取</h1>
    <p class="muted">取件码仅接单人可见；报酬建议线下微信转账。</p>

    <form @submit.prevent="submit">
      <div class="field">
        <label>取件码</label>
        <input v-model="form.pickup_code" placeholder="快递柜 / 驿站取件码" required />
      </div>
      <div class="grid2">
        <div class="field">
          <label>手机号后 4 位</label>
          <input v-model="form.phone_last4" maxlength="4" placeholder="1234" required />
        </div>
        <div class="field">
          <label>宿舍楼</label>
          <input v-model="form.dorm_building" placeholder="如 梅苑 3 栋" required />
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label>快递公司</label>
          <input v-model="form.express_company" placeholder="菜鸟 / 顺丰 / 京东…" />
        </div>
        <div class="field">
          <label>包裹大小</label>
          <select v-model="form.package_size">
            <option value="small">小件</option>
            <option value="medium">中件</option>
            <option value="large">大件</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>报酬（元）</label>
        <input v-model.number="form.reward" type="number" min="1" max="99" step="0.5" required />
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <button class="btn" type="submit" :disabled="loading">
        {{ loading ? '提交中…' : '发布到大厅' }}
      </button>
    </form>
  </main>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '../api/request'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const form = reactive({
  pickup_code: '',
  phone_last4: '',
  dorm_building: '',
  express_company: '',
  package_size: 'small',
  reward: 3,
})

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/orders', { method: 'POST', body: { ...form } })
    router.push(`/orders/${data.order.id}`)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.form-wrap {
  padding: 1.4rem;
  max-width: 560px;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 560px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
</style>
