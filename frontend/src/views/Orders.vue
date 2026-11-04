<template>
  <main>
    <div class="hero panel">
      <div>
        <h1>订单大厅</h1>
        <p class="muted">待接单列表 · 接单后才能看完整取件码与单号</p>
      </div>
      <RouterLink v-if="canPost" class="btn" to="/post">我要发单</RouterLink>
      <RouterLink
        v-else
        class="btn ghost"
        :to="{ name: 'login', query: { redirect: '/post', reason: isGuestUser ? 'guest' : undefined } }"
      >
        {{ isGuestUser ? '注册后发单' : '登录后发单' }}
      </RouterLink>
    </div>

    <section class="panel specialists">
      <div class="sp-head">
        <div>
          <h2>官方派送专员</h2>
          <p class="tip muted">想加入请联系管理员 QQ：{{ joinAdminQq }}</p>
        </div>
      </div>

      <ul v-if="specialists.length" class="sp-list">
        <li v-for="s in specialists" :key="s.id">
          <div class="sp-info">
            <strong>{{ s.nickname }}</strong>
            <span class="qq">QQ {{ s.qq }}</span>
            <span v-if="s.note" class="note muted">{{ s.note }}</span>
          </div>
          <button
            v-if="isAdmin"
            type="button"
            class="btn ghost sm danger"
            :disabled="busyId === s.id"
            @click="removeSpecialist(s)"
          >
            移除
          </button>
        </li>
      </ul>
      <p v-else class="muted empty-sp">暂无专员，欢迎联系管理员加入</p>

      <form v-if="isAdmin" class="sp-form" @submit.prevent="addSpecialist">
        <p class="admin-label">管理员：添加专员</p>
        <div class="sp-fields">
          <input v-model="form.nickname" maxlength="40" placeholder="昵称" required />
          <input v-model="form.qq" maxlength="12" placeholder="QQ 号" required />
          <input v-model="form.note" maxlength="80" placeholder="备注（可选）" />
          <button class="btn sm" type="submit" :disabled="adding">
            {{ adding ? '…' : '添加' }}
          </button>
        </div>
        <p v-if="spError" class="err">{{ spError }}</p>
        <p v-if="spOk" class="ok">{{ spOk }}</p>
      </form>
    </section>

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
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import OrderCard from '../components/OrderCard.vue'
import { getUser, isGuest, isMember, request } from '../api/request'

const router = useRouter()
const orders = ref([])
const loading = ref(true)
const error = ref('')
const filterCompany = ref('')
const canPost = computed(() => isMember())
const isGuestUser = computed(() => isGuest())

const specialists = ref([])
const isAdmin = ref(!!getUser()?.is_admin && isMember())
const joinAdminQq = ref('1440205803')
const adding = ref(false)
const busyId = ref(null)
const spError = ref('')
const spOk = ref('')
const form = reactive({
  nickname: '',
  qq: '',
  note: '',
})

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

async function loadSpecialists() {
  try {
    const data = await request('/orders/specialists')
    specialists.value = data.specialists || []
    isAdmin.value = !!data.is_admin
    if (data.join_admin_qq) joinAdminQq.value = data.join_admin_qq
  } catch {
    /* ignore */
  }
}

async function addSpecialist() {
  adding.value = true
  spError.value = ''
  spOk.value = ''
  try {
    await request('/orders/specialists', {
      method: 'POST',
      body: {
        nickname: form.nickname,
        qq: form.qq,
        note: form.note,
      },
    })
    form.nickname = ''
    form.qq = ''
    form.note = ''
    spOk.value = '已添加'
    await loadSpecialists()
  } catch (e) {
    spError.value = e.message
  } finally {
    adding.value = false
  }
}

async function removeSpecialist(s) {
  if (!window.confirm(`确定移除专员「${s.nickname}」（QQ ${s.qq}）？`)) return
  busyId.value = s.id
  spError.value = ''
  try {
    await request(`/orders/specialists/${s.id}`, { method: 'DELETE' })
    specialists.value = specialists.value.filter((x) => x.id !== s.id)
  } catch (e) {
    spError.value = e.message
  } finally {
    busyId.value = null
  }
}

function go(order) {
  router.push(`/orders/${order.id}`)
}

onMounted(async () => {
  await Promise.all([load(), loadSpecialists()])
})
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

.specialists {
  padding: 1.1rem 1.2rem 1.2rem;
  margin-bottom: 0.85rem;
}

.sp-head h2 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.25rem;
}

.tip {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
}

.sp-list {
  list-style: none;
  margin: 0.85rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.sp-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.72);
}

.sp-info {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.75rem;
  min-width: 0;
}

.qq {
  font-weight: 700;
  color: var(--accent);
  font-size: 0.92rem;
}

.note {
  font-size: 0.84rem;
}

.empty-sp {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
}

.sp-form {
  margin-top: 0.9rem;
  padding-top: 0.85rem;
  border-top: 1px dashed var(--line);
  display: grid;
  gap: 0.5rem;
}

.admin-label {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--accent-2);
}

.sp-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.sp-fields input {
  flex: 1;
  min-width: 110px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.5rem 0.7rem;
  background: #fff;
}

.sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.86rem;
}

.btn.danger {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.35);
}

.ok {
  margin: 0;
  color: var(--accent);
  font-size: 0.88rem;
  font-weight: 600;
}

.err {
  margin: 0;
  color: #c0392b;
  font-size: 0.9rem;
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

  .sp-list li {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
