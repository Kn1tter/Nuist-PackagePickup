<template>
  <main class="panel form-wrap">
    <h1>发布代拿</h1>
    <p class="muted">取件码与完整单号仅接单人可见；报酬建议线下微信转账。</p>

    <form @submit.prevent="submit">
      <div class="grid2">
        <div class="field">
          <label>快递公司</label>
          <select v-model="form.express_company" required>
            <option disabled value="">请选择</option>
            <option v-for="c in options.express_companies" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field">
          <label>包裹大小</label>
          <select v-model="form.package_size" required>
            <option v-for="s in options.package_sizes" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="field">
        <label>快递单号</label>
        <input
          v-model="form.tracking_no"
          inputmode="numeric"
          pattern="[0-9]{8,30}"
          maxlength="30"
          placeholder="仅数字，8–30 位"
          required
          @input="digitsOnly('tracking_no')"
        />
      </div>

      <div class="field">
        <label>取件码</label>
        <input v-model="form.pickup_code" placeholder="快递柜 / 驿站取件码" maxlength="50" required />
      </div>

      <div class="grid2">
        <div class="field">
          <label>手机号后 4 位</label>
          <input
            v-model="form.phone_last4"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]{4}"
            placeholder="1234"
            required
            @input="digitsOnly('phone_last4')"
          />
        </div>
        <div class="field">
          <label>宿舍楼</label>
          <select v-model="form.dorm_building" required>
            <option disabled value="">请选择</option>
            <option v-for="d in options.dorm_buildings" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label>报酬（元）</label>
        <div class="reward-row">
          <button
            v-for="n in rewardPresets"
            :key="n"
            class="chip"
            type="button"
            :class="{ on: form.reward === n }"
            @click="form.reward = n"
          >
            ¥{{ n }}
          </button>
          <input
            v-model.number="form.reward"
            type="number"
            min="1"
            max="99"
            step="0.5"
            required
          />
        </div>
      </div>

      <div class="field">
        <label>备注 <span class="opt">选填</span></label>
        <textarea
          v-model="form.remark"
          rows="3"
          maxlength="200"
          placeholder="如：放门口勿敲门、大件需帮忙搬上楼、驿站在南门…"
        />
        <p class="hint">{{ form.remark.length }}/200</p>
      </div>

      <p v-if="error" class="err">{{ error }}</p>
      <button class="btn" type="submit" :disabled="loading || !optionsReady">
        {{ loading ? '提交中…' : '发布到大厅' }}
      </button>
    </form>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '../api/request'

const router = useRouter()
const loading = ref(false)
const optionsReady = ref(false)
const error = ref('')
const rewardPresets = [2, 3, 5, 8]

const options = reactive({
  express_companies: [],
  dorm_buildings: [],
  package_sizes: [
    { value: 'small', label: '小件（文件/鞋盒以内）' },
    { value: 'medium', label: '中件（日常包裹）' },
    { value: 'large', label: '大件（需双手/较重）' },
  ],
})

const form = reactive({
  pickup_code: '',
  phone_last4: '',
  dorm_building: '',
  express_company: '',
  package_size: 'small',
  reward: 3,
  remark: '',
  tracking_no: '',
})

function digitsOnly(key) {
  form[key] = String(form[key] || '').replace(/\D/g, '')
}

async function loadOptions() {
  try {
    const data = await request('/orders/options')
    options.express_companies = data.express_companies || []
    options.dorm_buildings = data.dorm_buildings || []
    if (data.package_sizes?.length) options.package_sizes = data.package_sizes
    optionsReady.value = true
  } catch (e) {
    error.value = e.message || '加载选项失败'
  }
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/orders', {
      method: 'POST',
      body: {
        pickup_code: form.pickup_code.trim(),
        phone_last4: form.phone_last4,
        dorm_building: form.dorm_building,
        express_company: form.express_company,
        package_size: form.package_size,
        reward: form.reward,
        remark: form.remark.trim(),
        tracking_no: form.tracking_no,
      },
    })
    router.push(`/orders/${data.order.id}`)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(loadOptions)
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

.reward-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.reward-row input {
  flex: 1;
  min-width: 5rem;
}

.chip {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font: inherit;
  cursor: pointer;
  color: var(--text);
}

.chip.on {
  border-color: var(--accent);
  background: rgba(18, 53, 40, 0.1);
  font-weight: 600;
}

.opt {
  font-weight: 400;
  color: var(--muted);
  font-size: 0.85em;
}

textarea {
  width: 100%;
  resize: vertical;
  min-height: 4.5rem;
  font: inherit;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.85);
}

.hint {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
  text-align: right;
}

@media (max-width: 560px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
</style>
