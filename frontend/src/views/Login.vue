<template>
  <main class="auth-page">
    <canvas ref="canvasEl" class="net-bg" aria-hidden="true" />

    <section class="auth-card">
      <RouterLink class="back-home" to="/">
        <span class="back-arrow" aria-hidden="true">←</span>
        返回主菜单
      </RouterLink>

      <header class="card-head">
        <div class="step on">
          <span class="step-icon" aria-hidden="true">◇</span>
          <span>{{ mode === 'login' ? 'Sign In' : 'Sign Up' }}</span>
        </div>
        <div class="step-line" />
        <div class="step">
          <span class="step-icon" aria-hidden="true">◎</span>
          <span>南信大互助</span>
        </div>
      </header>

      <h1 class="title">{{ mode === 'login' ? '登录' : '注册' }}</h1>
      <p class="sub">
        {{ mode === 'login' ? '学号 + 密码 · The Greatest NUIST' : '学号 + 手机号 + 密码 · The Greatest NUIST' }}
      </p>
      <p v-if="guestHint" class="guest-hint">访客只能浏览，发帖 / 发单 / 开黑等请注册正式账号</p>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span>学号</span>
          <input v-model="form.student_id" placeholder="8–12 位数字" required autocomplete="username" />
        </label>
        <label v-if="mode === 'register'" class="field">
          <span>手机号</span>
          <input
            v-model="form.phone"
            type="tel"
            inputmode="numeric"
            maxlength="11"
            placeholder="11 位手机号"
            required
            autocomplete="tel"
          />
        </label>
        <label v-if="mode === 'register'" class="field">
          <span>昵称（可选）</span>
          <input v-model="form.nickname" placeholder="怎么称呼你" autocomplete="nickname" />
        </label>
        <label v-if="mode === 'register'" class="field">
          <span>个性签名（可选）</span>
          <input
            v-model="form.signature"
            maxlength="40"
            placeholder="写一句展示在排行榜上的话"
            autocomplete="off"
          />
        </label>
        <label class="field">
          <span>密码</span>
          <input
            v-model="form.password"
            type="password"
            placeholder="至少 6 位"
            required
            autocomplete="current-password"
          />
        </label>
        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="mode === 'login'" class="pwd-hint">
          如忘记密码，请联系管理员 <strong>1440205803</strong> 重置
        </p>
        <button class="primary" type="submit" :disabled="loading">
          {{ loading ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录' }}
        </button>
      </form>

      <button
        v-if="mode === 'login'"
        class="guest-btn"
        type="button"
        :disabled="loading"
        @click="guestLogin"
      >
        {{ loading ? '请稍候…' : '访客浏览（仅可查看）' }}
      </button>

      <button class="switch" type="button" @click="toggle">
        {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
      </button>
    </section>

    <footer class="auth-foot">
      <span>南信大互助平台</span>
      <span>© NUIST Mutual Aid</span>
    </footer>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearSession, request, setSession } from '../api/request'

const router = useRouter()
const route = useRoute()
const mode = ref(route.query.reason === 'guest' ? 'register' : 'login')
const loading = ref(false)
const error = ref('')
const canvasEl = ref(null)
const form = reactive({
  student_id: '',
  phone: '',
  nickname: '',
  signature: '',
  password: '',
})

const guestHint = computed(() => route.query.reason === 'guest')

let raf = 0
let nodes = []
let cleanupParticles = null
const mouse = { x: -9999, y: -9999, active: false }
const MAX_NODES = 140
const PUSH_COUNT = 4
const GRAB_DIST = 160
const LINK_DIST = 150

function toggle() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = ''
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const path = mode.value === 'login' ? '/auth/login' : '/auth/register'
    const body =
      mode.value === 'login'
        ? { student_id: form.student_id, password: form.password }
        : {
            student_id: form.student_id,
            phone: form.phone,
            password: form.password,
            nickname: form.nickname,
            signature: form.signature,
          }
    const data = await request(path, { method: 'POST', body })
    setSession(data.token, data.user)
    router.replace(route.query.redirect || '/')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function guestLogin() {
  loading.value = true
  error.value = ''
  try {
    clearSession()
    const data = await request('/auth/guest', { method: 'POST', body: {} })
    setSession(data.token, data.user)
    router.replace(route.query.redirect || '/')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function makeNode(x, y) {
  return {
    x: x ?? Math.random() * window.innerWidth,
    y: y ?? Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.7,
    vy: (Math.random() - 0.5) * 0.7,
    r: Math.random() * 1.6 + 0.7,
  }
}

function initParticles() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(window.innerWidth * dpr)
    canvas.height = Math.floor(window.innerHeight * dpr)
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const count = Math.floor((window.innerWidth * window.innerHeight) / 14000)
    const target = Math.max(36, Math.min(90, count))
    if (!nodes.length) {
      nodes = Array.from({ length: target }, () => makeNode())
    }
  }

  function onMove(e) {
    mouse.x = e.clientX
    mouse.y = e.clientY
    mouse.active = true
  }

  function onLeave() {
    mouse.active = false
    mouse.x = -9999
    mouse.y = -9999
  }

  function onClick(e) {
    // 点在卡片/页脚上不生成粒子，留给表单交互
    if (e.target !== canvas) return
    for (let i = 0; i < PUSH_COUNT; i++) {
      if (nodes.length >= MAX_NODES) nodes.shift()
      nodes.push(makeNode(e.clientX + (Math.random() - 0.5) * 12, e.clientY + (Math.random() - 0.5) * 12))
    }
  }

  function tick() {
    const w = window.innerWidth
    const h = window.innerHeight
    ctx.clearRect(0, 0, w, h)
    for (const n of nodes) {
      n.x += n.vx
      n.y += n.vy
      if (n.x < 0 || n.x > w) n.vx *= -1
      if (n.y < 0 || n.y > h) n.vy *= -1
      n.x = Math.min(w, Math.max(0, n.x))
      n.y = Math.min(h, Math.max(0, n.y))
    }
    const linkDist = Math.min(LINK_DIST, w * 0.14)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d = Math.hypot(dx, dy)
        if (d < linkDist) {
          ctx.strokeStyle = `rgba(136, 136, 136, ${0.4 * (1 - d / linkDist)})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
      if (mouse.active) {
        const a = nodes[i]
        const dx = a.x - mouse.x
        const dy = a.y - mouse.y
        const d = Math.hypot(dx, dy)
        if (d < GRAB_DIST) {
          ctx.strokeStyle = `rgba(136, 136, 136, ${0.4 * (1 - d / GRAB_DIST)})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(mouse.x, mouse.y)
          ctx.stroke()
        }
      }
    }
    for (const n of nodes) {
      ctx.fillStyle = 'rgba(136, 136, 136, 0.55)'
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      ctx.fill()
    }
    raf = requestAnimationFrame(tick)
  }

  resize()
  tick()
  window.addEventListener('resize', resize)
  canvas.addEventListener('mousemove', onMove)
  canvas.addEventListener('mouseleave', onLeave)
  canvas.addEventListener('click', onClick)
  cleanupParticles = () => {
    window.removeEventListener('resize', resize)
    canvas.removeEventListener('mousemove', onMove)
    canvas.removeEventListener('mouseleave', onLeave)
    canvas.removeEventListener('click', onClick)
  }
}

onMounted(initParticles)
onUnmounted(() => {
  cancelAnimationFrame(raf)
  cleanupParticles?.()
})
</script>

<style scoped>
.auth-page {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 2rem 1rem 4.5rem;
  background: #fff;
  overflow: hidden;
}

.net-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  /* 仅在登录页内跟随鼠标，不 fixed 盖全站 */
  pointer-events: auto;
  cursor: default;
}

.auth-card {
  position: relative;
  z-index: 1;
  width: min(420px, 100%);
  padding: 1.75rem 1.6rem 1.4rem;
  background: #fff;
  border: 1px solid #e6e8ec;
  border-radius: 4px;
  box-shadow: 0 10px 40px rgba(20, 30, 50, 0.06);
  animation: rise 0.45s ease both;
  pointer-events: auto;
}

.back-home {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 1.1rem;
  color: #8a93a3;
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
  transition: color 0.15s ease;
}

.back-home:hover {
  color: #409eff;
}

.back-arrow {
  color: #409eff;
  font-size: 0.95rem;
  line-height: 1;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1.35rem;
  color: #8a93a3;
  font-size: 0.92rem;
}

.step {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.step.on {
  color: #2f3542;
  font-weight: 700;
}

.step-icon {
  color: #409eff;
  font-size: 0.85rem;
}

.step-line {
  flex: 1;
  height: 1px;
  background: #e6e8ec;
}

.title {
  margin: 0;
  font-family: var(--font);
  font-size: 1.65rem;
  font-weight: 700;
  color: #2f3542;
}

.sub {
  margin: 0.35rem 0 1.2rem;
  color: #8a93a3;
  font-size: 0.92rem;
}

.form {
  display: grid;
  gap: 0.85rem;
}

.field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.86rem;
  color: #5c6575;
}

.field input {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0.7rem 0.8rem;
  background: #fff;
  color: #2f3542;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.field input:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.15);
}

.code-row {
  display: flex;
  gap: 0.55rem;
  align-items: stretch;
}

.code-row input {
  flex: 1;
  min-width: 0;
}

.code-btn {
  flex-shrink: 0;
  border: 1px solid #409eff;
  border-radius: 4px;
  padding: 0 0.85rem;
  background: #fff;
  color: #409eff;
  font-weight: 700;
  font-size: 0.86rem;
  cursor: pointer;
  white-space: nowrap;
}

.code-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  border-color: #c0c4cc;
  color: #909399;
}

.sms-hint {
  margin: 0;
  color: #409eff;
  font-size: 0.86rem;
}

.primary {
  margin-top: 0.25rem;
  border: none;
  border-radius: 4px;
  padding: 0.78rem 1rem;
  background: #409eff;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.65;
  cursor: wait;
}

.primary:not(:disabled):hover {
  background: #3a8ee6;
}

.guest-hint {
  margin: -0.35rem 0 0.85rem;
  padding: 0.55rem 0.7rem;
  border-radius: 4px;
  background: rgba(64, 158, 255, 0.1);
  color: #337ecc;
  font-size: 0.86rem;
  line-height: 1.45;
}

.guest-btn {
  margin-top: 0.75rem;
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0.72rem 1rem;
  background: #fff;
  color: #606266;
  font-weight: 700;
  cursor: pointer;
}

.guest-btn:hover:not(:disabled) {
  border-color: #409eff;
  color: #409eff;
}

.guest-btn:disabled {
  opacity: 0.65;
  cursor: wait;
}

.switch {
  margin-top: 1rem;
  border: none;
  background: none;
  color: #409eff;
  cursor: pointer;
  font-weight: 600;
  padding: 0;
}

.err {
  margin: 0;
  color: #e34d59;
  font-size: 0.88rem;
}

.pwd-hint {
  margin: 0;
  color: #8a93a3;
  font-size: 0.86rem;
  line-height: 1.45;
}

.pwd-hint strong {
  color: #5c6575;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.auth-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  background: #f5f6f8;
  color: #8a93a3;
  font-size: 0.82rem;
  border-top: 1px solid #e6e8ec;
  pointer-events: auto;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 520px) {
  .auth-card {
    border: none;
    box-shadow: none;
    padding: 1.2rem 0.4rem;
  }

  .auth-foot {
    font-size: 0.75rem;
  }
}
</style>
