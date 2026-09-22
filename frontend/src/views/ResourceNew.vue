<template>
  <main class="panel form-wrap">
    <h1>分享资源</h1>
    <p class="muted">推荐贴网盘 / 在线文档链接（Vercel 不适合存大文件）。</p>

    <form @submit.prevent="submit">
      <div class="field">
        <label>标题</label>
        <input v-model="form.title" maxlength="120" placeholder="如：高数期末复习资料" required />
      </div>
      <div class="field">
        <label>分类</label>
        <select v-model="form.category">
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="field">
        <label>链接</label>
        <input v-model="form.url" type="url" placeholder="https://..." required />
      </div>
      <div class="field">
        <label>简介（可选）</label>
        <textarea v-model="form.description" rows="4" maxlength="1000" placeholder="提取码、适用课程等" />
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
import { request } from '../api/request'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const categories = ref(['课件', '历年卷', '软件工具', '学习资料', '其他'])
const form = reactive({
  title: '',
  url: '',
  description: '',
  category: '学习资料',
})

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await request('/resources', { method: 'POST', body: { ...form } })
    router.replace('/resources')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const data = await request('/resources')
    if (data.categories?.length) categories.value = data.categories
  } catch {
    /* keep defaults */
  }
})
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
