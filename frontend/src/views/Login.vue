<template>
  <main class="auth-page">
    <canvas ref="canvasEl" class="net-bg" aria-hidden="true" />

    <section class="auth-card">
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
      <p class="sub">学号登录 · The Greatest NUIST</p>

      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span>学号</span>
          <input v-model="form.student_id" placeholder="8–12 位数字" required autocomplete="username" />
        </label>
        <label v-if="mode === 'register'" class="field">
          <span>手机号</span>
          <input v-model="form.phone" placeholder="11 位手机号" required autocomplete="tel" />
        </label>
        <label v-if="mode === 'register'" class="field">
          <span>昵称（可选）</span>
          <input v-model="form.nickname" placeholder="怎么称呼你" autocomplete="nickname" />
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
        <button class="primary" type="submit" :disabled="loading">
          {{ loading ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录' }}
        </button>
      </form>

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
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request, setSession } from '../api/request'

const router = useRouter()
const route = useRoute()
const mode = ref('login')
const loading = ref(false)
const error = ref('')
const canvasEl = ref(null)
const form = reactive({
  student_id: '',
  phone: '',
  nickname: '',
  password: '',
})

let raf = 0
let nodes = []
let resizeObs = null

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
        : { ...form }
    const data = await request(path, { method: 'POST', body })
    setSession(data.token, data.user)
    router.replace(route.query.redirect || '/')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
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
    nodes = Array.from({ length: Math.max(36, Math.min(90, count)) }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.7,
    }))
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
    }
    const linkDist = Math.min(160, w * 0.14)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const d = Math.hypot(dx, dy)
        if (d < linkDist) {
          ctx.strokeStyle = `rgba(120, 130, 145, ${0.22 * (1 - d / linkDist)})`
          ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }
    }
    for (const n of nodes) {
      ctx.fillStyle = 'rgba(110, 120, 135, 0.55)'
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      ctx.fill()
    }
    raf = requestAnimationFrame(tick)
  }

  resize()
  tick()
  window.addEventListener('resize', resize)
  resizeObs = () => window.removeEventListener('resize', resize)
}

onMounted(initParticles)
onUnmounted(() => {
  cancelAnimationFrame(raf)
  resizeObs?.()
})
</script>

<style scoped>
.auth-page {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 2rem 1rem 4.5rem;
  background: #fff;
  overflow: hidden;
}

.net-bg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
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
  font-family: 'DM Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
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

.auth-foot {
  position: fixed;
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
