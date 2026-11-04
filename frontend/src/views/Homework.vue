<template>
  <main class="wrap">
    <div class="hero panel">
      <div>
        <h1>学习通作业</h1>
        <p class="muted">
          绑定本人学习通账号后，可查看提交状态与截止时间；开启提醒后，临近截止会写入站内消息，也可配 Bark 推到手机。
        </p>
      </div>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="okMsg" class="ok">{{ okMsg }}</p>

    <section class="panel block">
      <h2>{{ binding ? '账号与提醒' : '绑定学习通' }}</h2>
      <p v-if="binding" class="tip muted">
        已绑定 {{ binding.cx_username }}
        <template v-if="binding.last_fetch_at"> · 上次同步 {{ formatTime(binding.last_fetch_at) }}</template>
        <template v-if="binding.last_error"> · 最近错误：{{ binding.last_error }}</template>
      </p>

      <form class="grid" @submit.prevent="saveBinding">
        <div class="field grow">
          <label>账号（手机号/学号）</label>
          <input v-model="form.username" autocomplete="username" :placeholder="binding?.cx_username || '学习通账号'" />
        </div>
        <div class="field grow">
          <label>{{ binding ? '密码（留空则只改设置）' : '密码' }}</label>
          <input v-model="form.password" type="password" autocomplete="current-password" placeholder="不会明文存库" />
        </div>
        <div class="field">
          <label>临期提醒（小时内）</label>
          <input v-model.number="form.notify_hours_before" type="number" min="1" max="168" />
        </div>
        <div class="field">
          <label>最多查几门课</label>
          <input v-model.number="form.course_limit" type="number" min="1" max="30" />
        </div>
        <div class="field grow">
          <label>Bark 推送地址（iPhone 推荐）</label>
          <input
            v-model="form.push_bark_url"
            placeholder="https://api.day.app/你的Key  或直接贴 Key"
          />
        </div>
        <div class="field grow">
          <label>Webhook URL（安卓可用 PushPlus / Server酱等）</label>
          <input v-model="form.push_webhook_url" placeholder="https://…" />
        </div>
        <label class="check">
          <input v-model="form.notify_enabled" type="checkbox" />
          开启定时提醒（站内信 + Bark/Webhook）
        </label>
        <div class="row">
          <button class="btn" type="submit" :disabled="saving">
            {{ saving ? '保存中…' : binding ? '保存' : '验证并绑定' }}
          </button>
          <button v-if="binding" class="btn ghost" type="button" :disabled="saving" @click="unbind">
            解除绑定
          </button>
          <button v-if="binding" class="btn ghost" type="button" :disabled="pushing" @click="testPush">
            {{ pushing ? '…' : '测试推送' }}
          </button>
        </div>
      </form>

      <details class="bark-help">
        <summary>Bark 手机推送 · 一步到位</summary>
        <ol>
          <li>
            iPhone 打开 App Store，搜
            <strong>Bark</strong>
            并安装（开发者 Fin）。
          </li>
          <li>打开 Bark，允许通知；首页会显示一串推送地址，类似：</li>
        </ol>
        <pre class="code">https://api.day.app/xxxxxxxxxxxxxxxxxxxxxx</pre>
        <ol start="3">
          <li>整段复制（或只复制 Key），粘贴到上方「Bark 推送地址」。</li>
          <li>勾选「开启定时提醒」，点 <strong>保存</strong>。</li>
          <li>点 <strong>测试推送</strong>：手机应立刻弹出「学习通推送测试」；站内消息里也会有一条。</li>
          <li>
            系统设置 → 通知 → Bark：建议打开横幅、声音；需要强提醒时可开「时间敏感通知」。
          </li>
        </ol>
        <p class="tip muted">
          安卓没有 Bark：可用
          <a href="https://www.pushplus.plus/" target="_blank" rel="noopener">PushPlus</a>
          /
          <a href="https://sct.ftqq.com/" target="_blank" rel="noopener">Server酱</a>
          生成 Webhook，填到上面第二栏。凭证 AES 加密存库，只拉你自己的作业。
        </p>
      </details>
    </section>

    <section v-if="binding" class="panel block">
      <div class="row between">
        <h2>作业列表</h2>
        <div class="row">
          <select v-model="statusFilter">
            <option value="">全部状态</option>
            <option value="未交">未交</option>
            <option value="待互评">待互评</option>
            <option value="待批阅">待批阅</option>
            <option value="已完成">已完成</option>
          </select>
          <button class="btn" type="button" :disabled="loading" @click="loadHomework(true)">
            {{ loading ? '同步中…' : '刷新' }}
          </button>
        </div>
      </div>
      <p class="tip muted">
        未交 {{ pendingCount }} · 展示 {{ filtered.length }}
        <template v-if="cached"> · 缓存数据</template>
        <template v-if="fetchedAt"> · {{ formatTime(fetchedAt) }}</template>
      </p>
      <p v-for="(e, i) in fetchErrors" :key="i" class="tip warn">{{ e }}</p>

      <article v-for="(hw, idx) in filtered" :key="idx" class="hw" :data-status="hw.status">
        <div class="hw-top">
          <strong>{{ hw.title }}</strong>
          <span class="badge">{{ statusLabel(hw) }}</span>
        </div>
        <p class="muted">{{ hw.courseName }}</p>
        <p class="deadline">
          <template v-if="hw.expired && hw.status === '未交'">截止：已过期/未知</template>
          <template v-else-if="hw.deadline">截止：{{ hw.deadline }}</template>
          <template v-else-if="hw.remaining">{{ hw.remaining }}</template>
          <template v-else>截止时间未公布</template>
        </p>
        <a v-if="hw.detailUrl" class="link" :href="hw.detailUrl" target="_blank" rel="noopener">打开作业</a>
      </article>
      <p v-if="!loading && !filtered.length" class="muted">暂无作业，或筛选条件下为空。</p>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { request } from '../api/request'

const binding = ref(null)
const homeworks = ref([])
const fetchErrors = ref([])
const cached = ref(false)
const fetchedAt = ref('')
const statusFilter = ref('未交')
const error = ref('')
const okMsg = ref('')
const saving = ref(false)
const loading = ref(false)
const pushing = ref(false)

const form = reactive({
  username: '',
  password: '',
  notify_enabled: true,
  notify_hours_before: 48,
  course_limit: 12,
  push_bark_url: '',
  push_webhook_url: '',
})

const pendingCount = computed(() => homeworks.value.filter((h) => h.status === '未交').length)
const filtered = computed(() => {
  if (!statusFilter.value) return homeworks.value
  return homeworks.value.filter((h) => h.status === statusFilter.value)
})

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(hw) {
  if (hw.expired && hw.status === '未交') return '未交·过期'
  return hw.status
}

function applyBinding(b) {
  binding.value = b
  if (!b) return
  form.username = b.cx_username || ''
  form.notify_enabled = !!b.notify_enabled
  form.notify_hours_before = Number(b.notify_hours_before || 48)
  form.course_limit = Number(b.course_limit || 12)
  form.push_bark_url = b.push_bark_url || ''
  form.push_webhook_url = b.push_webhook_url || ''
}

async function loadBinding() {
  const data = await request('/chaoxing/binding')
  applyBinding(data.binding)
}

async function saveBinding() {
  error.value = ''
  okMsg.value = ''
  saving.value = true
  try {
    if (!binding.value || form.password) {
      if (!form.username.trim() || !form.password) {
        throw new Error('请填写账号和密码')
      }
      const data = await request('/chaoxing/binding', {
        method: 'POST',
        body: {
          username: form.username.trim(),
          password: form.password,
          notify_enabled: form.notify_enabled,
          notify_hours_before: form.notify_hours_before,
          course_limit: form.course_limit,
          push_bark_url: form.push_bark_url,
          push_webhook_url: form.push_webhook_url,
        },
      })
      applyBinding(data.binding)
      form.password = ''
      okMsg.value = '绑定成功'
      await loadHomework(true)
    } else {
      const data = await request('/chaoxing/binding', {
        method: 'PATCH',
        body: {
          notify_enabled: form.notify_enabled,
          notify_hours_before: form.notify_hours_before,
          course_limit: form.course_limit,
          push_bark_url: form.push_bark_url,
          push_webhook_url: form.push_webhook_url,
        },
      })
      applyBinding(data.binding)
      okMsg.value = '设置已保存'
    }
  } catch (e) {
    error.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function unbind() {
  if (!confirm('确定解除学习通绑定？缓存与提醒记录会一并清除。')) return
  error.value = ''
  saving.value = true
  try {
    await request('/chaoxing/binding', { method: 'DELETE' })
    binding.value = null
    homeworks.value = []
    form.password = ''
    form.username = ''
    okMsg.value = '已解除绑定'
  } catch (e) {
    error.value = e.message || '解除失败'
  } finally {
    saving.value = false
  }
}

async function loadHomework(refresh = false) {
  if (!binding.value) return
  error.value = ''
  loading.value = true
  try {
    const q = refresh ? '?refresh=1' : ''
    const data = await request(`/chaoxing/homework${q}`)
    applyBinding(data.binding)
    homeworks.value = data.homeworks || []
    fetchErrors.value = data.errors || []
    cached.value = !!data.cached
    fetchedAt.value = data.fetched_at || ''
  } catch (e) {
    error.value = e.message || '拉取失败'
  } finally {
    loading.value = false
  }
}

async function testPush() {
  pushing.value = true
  error.value = ''
  okMsg.value = ''
  try {
    await request('/chaoxing/test-push', { method: 'POST', body: {} })
    okMsg.value = '已发送测试推送，请查看站内消息 / Bark'
  } catch (e) {
    error.value = e.message || '推送失败'
  } finally {
    pushing.value = false
  }
}

onMounted(async () => {
  try {
    await loadBinding()
    if (binding.value) await loadHomework(false)
  } catch (e) {
    error.value = e.message || '加载失败'
  }
})
</script>

<style scoped>
.wrap {
  max-width: 920px;
  margin: 0 auto;
  padding: 1rem 1rem 2.5rem;
  display: grid;
  gap: 1rem;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.15rem 1.25rem;
}

.hero h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.7rem, 4vw, 2.2rem);
}

.hero .muted {
  margin: 0.45rem 0 0;
}

.block h2 {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field.grow {
  grid-column: span 2;
}

.field label,
.check {
  font-size: 0.85rem;
  color: var(--muted);
}

input,
select {
  font: inherit;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
}

.check {
  grid-column: span 2;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}

.row.between {
  justify-content: space-between;
  margin-bottom: 0.35rem;
}

.row.between h2 {
  margin: 0;
}

.btn {
  appearance: none;
  border: none;
  cursor: pointer;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 600;
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  text-decoration: none;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.ghost {
  background: transparent;
  color: var(--accent);
  border: 1px solid rgba(31, 122, 77, 0.35);
}

.tip {
  margin: 0.65rem 0 0;
  font-size: 0.86rem;
}

.bark-help {
  margin-top: 0.9rem;
  padding: 0.75rem 0.9rem;
  border-radius: 14px;
  border: 1px dashed rgba(31, 122, 77, 0.28);
  background: rgba(232, 242, 236, 0.55);
  font-size: 0.9rem;
}

.bark-help summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--accent);
}

.bark-help ol {
  margin: 0.55rem 0 0;
  padding-left: 1.2rem;
  line-height: 1.55;
}

.bark-help .code {
  margin: 0.45rem 0;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  background: rgba(20, 36, 28, 0.06);
  font-size: 0.82rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.bark-help a {
  color: var(--accent);
}

.tip.warn {
  color: #9a4b1c;
}

.err {
  color: #a33;
  margin: 0;
}

.ok {
  color: var(--accent);
  margin: 0;
}

.hw {
  margin-top: 0.75rem;
  padding: 0.85rem 0.9rem;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.72);
}

.hw-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.hw-top strong {
  font-size: 1.02rem;
}

.badge {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(31, 122, 77, 0.12);
  color: var(--accent);
}

.hw[data-status='未交'] .badge {
  background: rgba(196, 92, 38, 0.14);
  color: #9a4b1c;
}

.hw[data-status='待互评'] .badge {
  background: rgba(110, 70, 160, 0.12);
  color: #6a3d9a;
}

.hw .muted {
  margin: 0.25rem 0 0;
  font-size: 0.88rem;
}

.deadline {
  margin: 0.35rem 0 0;
  font-weight: 600;
}

.link {
  display: inline-block;
  margin-top: 0.4rem;
  font-size: 0.88rem;
  color: var(--accent);
}

@media (max-width: 700px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .field.grow,
  .check {
    grid-column: span 1;
  }
}
</style>
