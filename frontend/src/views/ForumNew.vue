<template>
  <main class="panel form-wrap">
    <h1>发帖</h1>
    <p class="muted">说清楚一点，方便同学回复和跟进。</p>

    <form @submit.prevent="submit">
      <div class="field">
        <label>标题</label>
        <input v-model="form.title" maxlength="120" placeholder="例如：食堂建议 / 失物招领" required />
      </div>
      <div class="field">
        <label>正文</label>
        <textarea v-model="form.body" rows="8" maxlength="5000" placeholder="详细说说…" required />
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
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '../api/request'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const form = reactive({ title: '', body: '' })

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/forum/posts', { method: 'POST', body: { ...form } })
    router.replace(`/forum/${data.post.id}`)
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
