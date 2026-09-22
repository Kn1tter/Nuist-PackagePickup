<template>
  <main class="panel auth">
    <h1>{{ mode === 'login' ? '登录' : '注册' }}</h1>
    <p class="muted">学号登录 · Make NUIST Better</p>

    <form @submit.prevent="submit">
      <div class="field">
        <label>学号</label>
        <input v-model="form.student_id" placeholder="8–12 位数字" required />
      </div>
      <div v-if="mode === 'register'" class="field">
        <label>手机号</label>
        <input v-model="form.phone" placeholder="11 位手机号" required />
      </div>
      <div v-if="mode === 'register'" class="field">
        <label>昵称（可选）</label>
        <input v-model="form.nickname" placeholder="怎么称呼你" />
      </div>
      <div class="field">
        <label>密码</label>
        <input v-model="form.password" type="password" placeholder="至少 6 位" required />
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <button class="btn" type="submit" :disabled="loading">
        {{ loading ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录' }}
      </button>
    </form>

    <button class="link" type="button" @click="toggle">
      {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
    </button>
  </main>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request, setSession } from '../api/request'

const router = useRouter()
const route = useRoute()
const mode = ref('login')
const loading = ref(false)
const error = ref('')
const form = reactive({
  student_id: '',
  phone: '',
  nickname: '',
  password: '',
})

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
</script>

<style scoped>
.auth {
  padding: 1.6rem;
  max-width: 420px;
  margin: 2rem auto 0;
  animation: rise 0.45s ease both;
}

h1 {
  margin: 0 0 0.35rem;
  font-family: var(--display);
  font-size: 2rem;
}

.btn {
  width: 100%;
  margin-top: 0.4rem;
}

.link {
  margin-top: 1rem;
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
