<template>
  <main class="panel profile">
    <h1>我的</h1>
    <p v-if="user" class="muted">
      <template v-if="user.is_guest">访客模式 · 仅可浏览</template>
      <template v-else>
        学号 {{ user.student_id }} · 信用 {{ user.credit_score }} · Lv.{{ user.level || 1 }}
        <span v-if="user.is_admin" class="admin-tag">管理员</span>
      </template>
    </p>

    <section v-if="user?.is_guest" class="guest-box">
      <p>访客可以逛论坛、资源库、代拿大厅等，但不能发帖、发单、开黑或对战。</p>
      <RouterLink class="btn" :to="{ name: 'login', query: { reason: 'guest' } }">注册正式账号</RouterLink>
    </section>

    <template v-else>
      <div class="stats" v-if="user">
        <div>
          <strong>{{ user.nickname || '同学' }}</strong>
          <span class="muted">昵称</span>
        </div>
        <div>
          <strong>{{ user.student_id }}</strong>
          <span class="muted">学号</span>
        </div>
      </div>

      <section v-if="user" class="nick-box">
        <h2>修改昵称</h2>
        <p class="tip muted">每天只能改一次（按北京时间自然日），最多 20 字</p>
        <div class="sig-row">
          <input
            v-model="nicknameDraft"
            maxlength="20"
            placeholder="新昵称"
            :disabled="!canChangeNickname || savingNick"
          />
          <button
            class="btn"
            type="button"
            :disabled="!canChangeNickname || savingNick || !nicknameDraft.trim()"
            @click="saveNickname"
          >
            {{ savingNick ? '…' : canChangeNickname ? '保存' : '今日已改' }}
          </button>
        </div>
        <p v-if="nickOk" class="ok">{{ nickOk }}</p>
        <p v-if="nickErr" class="err">{{ nickErr }}</p>
      </section>

      <section v-if="user" class="xp-box">
        <div class="xp-top">
          <strong>论坛等级 Lv.{{ user.level || 1 }}</strong>
          <span class="muted">
            {{ user.xp_into_level || 0 }} / {{ user.xp_to_next || 0 }} 经验
            （总 {{ user.xp || 0 }}）
          </span>
        </div>
        <div class="xp-bar">
          <div class="xp-fill" :style="{ width: `${Math.round((user.xp_progress || 0) * 100)}%` }" />
        </div>
        <p class="tip muted">发帖、回复、被点赞可获得经验；等级越高，升级所需经验越多。</p>
      </section>

      <section v-if="user" class="sig-box">
        <h2>个性签名</h2>
        <p class="tip muted">展示在小游戏排行榜上，最多 40 字</p>
        <div class="sig-row">
          <input v-model="signatureDraft" maxlength="40" placeholder="写一句给自己的话…" />
          <button class="btn" type="button" :disabled="savingSig" @click="saveSignature">
            {{ savingSig ? '…' : '保存' }}
          </button>
        </div>
        <p v-if="sigOk" class="ok">{{ sigOk }}</p>
        <p v-if="sigErr" class="err">{{ sigErr }}</p>
        <p v-if="myStats" class="stats-line muted">
          战绩 · 胜 {{ myStats.all.wins }} / 负 {{ myStats.all.losses }} / 逃 {{ myStats.all.flees }}
          （台球 {{ myStats.pool.wins }}-{{ myStats.pool.losses }}，骷髅
          {{ myStats.skull.wins }}-{{ myStats.skull.losses }}，坦克
          {{ myStats.tank?.wins || 0 }}-{{ myStats.tank?.losses || 0 }}，冰壶
          {{ myStats.curling?.wins || 0 }}-{{ myStats.curling?.losses || 0 }}，小恐龙最高
          {{ myStats.dino?.best_score || 0 }}）
        </p>
      </section>

      <div class="admin-links">
        <RouterLink class="btn ghost announce-link" to="/homework">学习通作业</RouterLink>
        <RouterLink class="btn ghost announce-link" to="/schedule">我的课表</RouterLink>
        <template v-if="user?.is_admin">
          <RouterLink class="btn announce-link" to="/admin/users">
            用户管理
            <span v-if="onlineCount != null" class="online-pill">在线 {{ onlineCount }}</span>
          </RouterLink>
          <RouterLink class="btn ghost announce-link" to="/messages">发全站公告</RouterLink>
          <RouterLink class="btn ghost announce-link" to="/changelog/new">发更新日志</RouterLink>
        </template>
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
    </template>

    <button class="btn ghost logout" type="button" @click="logout">
      {{ user?.is_guest ? '退出访客' : '退出登录' }}
    </button>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import OrderCard from '../components/OrderCard.vue'
import { clearSession, getToken, getUser, request, setSession } from '../api/request'

const router = useRouter()
const user = ref(getUser())
const tab = ref('posted')
const orders = ref([])
const loading = ref(false)
const error = ref('')
const signatureDraft = ref(user.value?.signature || '')
const savingSig = ref(false)
const sigOk = ref('')
const sigErr = ref('')
const nicknameDraft = ref(user.value?.nickname || '')
const savingNick = ref(false)
const nickOk = ref('')
const nickErr = ref('')
const myStats = ref(null)

const canChangeNickname = computed(() => user.value?.can_change_nickname !== false)

async function refreshMe() {
  try {
    const data = await request('/auth/me')
    user.value = data.user
    signatureDraft.value = data.user?.signature || ''
    nicknameDraft.value = data.user?.nickname || ''
    setSession(getToken(), data.user)
  } catch {
    /* ignore */
  }
}

async function saveNickname() {
  savingNick.value = true
  nickOk.value = ''
  nickErr.value = ''
  try {
    const data = await request('/auth/me/nickname', {
      method: 'PATCH',
      body: { nickname: nicknameDraft.value },
    })
    user.value = data.user
    nicknameDraft.value = data.user?.nickname || ''
    setSession(getToken(), data.user)
    nickOk.value = '昵称已更新'
  } catch (e) {
    nickErr.value = e.message
  } finally {
    savingNick.value = false
  }
}

async function loadStats() {
  try {
    const data = await request('/arcade/me/stats')
    myStats.value = data.stats
    if (data.user?.signature != null) signatureDraft.value = data.user.signature
  } catch {
    /* ignore */
  }
}

async function saveSignature() {
  savingSig.value = true
  sigOk.value = ''
  sigErr.value = ''
  try {
    const data = await request('/arcade/me/signature', {
      method: 'PATCH',
      body: { signature: signatureDraft.value },
    })
    if (user.value) {
      user.value = { ...user.value, signature: data.user.signature }
      setSession(getToken(), user.value)
    }
    signatureDraft.value = data.user.signature || ''
    sigOk.value = '签名已保存'
  } catch (e) {
    sigErr.value = e.message
  } finally {
    savingSig.value = false
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
  if (user.value?.is_guest) return
  await Promise.all([switchTab('posted'), loadStats()])
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

.xp-box {
  margin: 0 0 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  display: grid;
  gap: 0.45rem;
}

.xp-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
  font-size: 0.9rem;
}

.xp-bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(15, 47, 36, 0.1);
  overflow: hidden;
}

.xp-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), #3aa06a);
  transition: width 0.25s ease;
}

.xp-box .tip {
  margin: 0;
  font-size: 0.82rem;
}

.guest-box {
  margin: 1rem 0 1.25rem;
  padding: 1rem 1.1rem;
  border-radius: var(--radius);
  border: 1px solid rgba(64, 158, 255, 0.28);
  background: rgba(64, 158, 255, 0.08);
  display: grid;
  gap: 0.75rem;
}

.guest-box p {
  margin: 0;
  line-height: 1.5;
  color: var(--muted);
}

.nick-box,
.sig-box {
  margin: 0 0 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  display: grid;
  gap: 0.55rem;
}

.nick-box h2,
.sig-box h2 {
  margin: 0;
  font-size: 1.05rem;
}

.nick-box .tip,
.sig-box .tip {
  margin: 0;
  font-size: 0.86rem;
}

.sig-row {
  display: flex;
  gap: 0.5rem;
}

.sig-row input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  background: #fff;
}

.stats-line {
  margin: 0;
  font-size: 0.86rem;
}

.admin-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.announce-link {
  display: inline-flex;
  text-decoration: none;
}

.phone-box {
  margin: 0 0 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  display: grid;
  gap: 0.7rem;
}

.phone-box h2 {
  margin: 0;
  font-size: 1.05rem;
}

.phone-box .tip {
  margin: 0;
  font-size: 0.86rem;
}

.phone-box .field {
  display: grid;
  gap: 0.3rem;
  font-size: 0.88rem;
  color: var(--muted);
}

.phone-box input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  background: #fff;
  color: var(--ink);
}

.code-row {
  display: flex;
  gap: 0.5rem;
}

.code-row input {
  flex: 1;
  min-width: 0;
}

.code-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

.ok {
  margin: 0;
  color: var(--accent);
  font-weight: 600;
  font-size: 0.9rem;
}

.err {
  margin: 0;
  color: #c0392b;
  font-size: 0.9rem;
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

.admin-tag {
  display: inline-block;
  margin-left: 0.45rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(196, 92, 38, 0.15);
  color: var(--accent-2);
  font-size: 0.78rem;
  font-weight: 700;
}
</style>
