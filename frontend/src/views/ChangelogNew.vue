<template>
  <main class="panel form-wrap">
    <h1>发布更新</h1>
    <p class="muted">写清楚这次改了什么，方便同学们查看。仅管理员可发布。</p>

    <form @submit.prevent="submit">
      <div class="field">
        <label>标题</label>
        <input
          v-model="form.title"
          maxlength="120"
          placeholder="例如：v1.2 · 坦克新车种 / 时区修复"
          required
        />
      </div>
      <div class="field">
        <label>正文</label>
        <textarea
          v-model="form.body"
          rows="10"
          maxlength="8000"
          placeholder="可用多行列出改动点…"
          required
        />
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <div class="actions">
        <button class="btn ghost" type="button" @click="router.back()">取消</button>
        <button class="btn" type="submit" :disabled="loading">
          {{ loading ? '发布中…' : '发布' }}
        </button>
      </div>
    </form>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getUser, request } from '../api/request'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const form = reactive({ title: '', body: '' })

onMounted(async () => {
  try {
    const data = await request('/auth/me')
    if (!data.user?.is_admin) {
      error.value = '仅管理员可发布更新日志'
      router.replace('/changelog')
    }
  } catch {
    if (!getUser()?.is_admin) router.replace('/changelog')
  }
})

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/changelog', { method: 'POST', body: { ...form } })
    router.replace(`/changelog/${data.entry.id}`)
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
  max-width: 640px;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  background: #fff;
}

.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 0.5rem;
}
</style>
