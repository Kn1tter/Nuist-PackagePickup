<template>
  <main v-if="resource" class="wrap">
    <section class="panel detail">
      <div class="top">
        <span class="cat">{{ resource.category }}</span>
        <div class="actions">
          <button v-if="resource.can_edit" class="btn ghost" type="button" @click="editing = !editing">
            {{ editing ? '取消编辑' : '编辑' }}
          </button>
          <button v-if="resource.can_delete" class="link-del" type="button" @click="remove">删除</button>
        </div>
      </div>

      <template v-if="!editing">
        <h1>{{ resource.title }}</h1>
        <p v-if="resource.description" class="desc">{{ resource.description }}</p>
        <div class="meta muted">
          <span>{{ resource.nickname || '同学' }}</span>
          <span>{{ formatTime(resource.created_at) }}</span>
        </div>
        <a class="btn" :href="resource.url" target="_blank" rel="noopener noreferrer">打开链接</a>
      </template>

      <form v-else class="edit-form" @submit.prevent="save">
        <div class="field">
          <label>标题</label>
          <input v-model="form.title" maxlength="120" required />
        </div>
        <div class="field">
          <label>分类</label>
          <select v-model="form.category">
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="field">
          <label>链接</label>
          <input v-model="form.url" type="url" required />
        </div>
        <div class="field">
          <label>简介</label>
          <textarea v-model="form.description" rows="4" maxlength="1000" />
        </div>
        <p v-if="editError" class="err">{{ editError }}</p>
        <button class="btn" type="submit" :disabled="saving">
          {{ saving ? '保存中…' : '保存修改' }}
        </button>
      </form>
    </section>

    <section class="panel comments">
      <h2>评论 {{ comments.length }}</h2>
      <form class="comment-form" @submit.prevent="postComment">
        <textarea
          v-model="commentText"
          rows="3"
          maxlength="1000"
          placeholder="说说这份资料好不好用、有没有补充…"
          required
        />
        <p v-if="commentError" class="err">{{ commentError }}</p>
        <button class="btn" type="submit" :disabled="commenting">
          {{ commenting ? '发送中…' : '发表评论' }}
        </button>
      </form>

      <p v-if="!comments.length" class="muted empty">还没有评论，来写第一条吧。</p>
      <article v-for="c in comments" :key="c.id" class="comment">
        <div class="comment-top">
          <strong>{{ c.nickname || '同学' }}</strong>
          <span class="muted">{{ formatTime(c.created_at) }}</span>
          <button v-if="c.can_delete" class="link-del" type="button" @click="removeComment(c.id)">
            删除
          </button>
        </div>
        <p>{{ c.body }}</p>
      </article>
    </section>

    <RouterLink class="back muted" to="/resources">← 返回资源库</RouterLink>
  </main>
  <p v-else-if="error" class="err">{{ error }}</p>
  <p v-else class="muted">加载中…</p>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request, requireLogin } from '../api/request'

const route = useRoute()
const router = useRouter()
const resource = ref(null)
const comments = ref([])
const categories = ref(['课件', '历年卷', '软件工具', '学习资料', '其他'])
const error = ref('')
const editing = ref(false)
const saving = ref(false)
const editError = ref('')
const commentText = ref('')
const commenting = ref(false)
const commentError = ref('')

const form = reactive({
  title: '',
  url: '',
  description: '',
  category: '学习资料',
})

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function fillForm(r) {
  form.title = r.title || ''
  form.url = r.url || ''
  form.description = r.description || ''
  form.category = r.category || '学习资料'
}

async function load() {
  error.value = ''
  try {
    const data = await request(`/resources/${route.params.id}`)
    resource.value = data.resource
    comments.value = data.comments || []
    if (data.categories?.length) categories.value = data.categories
    fillForm(data.resource)
  } catch (e) {
    error.value = e.message
  }
}

async function save() {
  if (!requireLogin(router)) return
  saving.value = true
  editError.value = ''
  try {
    const data = await request(`/resources/${route.params.id}`, {
      method: 'PUT',
      body: { ...form },
    })
    resource.value = data.resource
    fillForm(data.resource)
    editing.value = false
  } catch (e) {
    editError.value = e.message
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!requireLogin(router)) return
  if (!confirm('确定删除这条资源？评论也会一起删除。')) return
  try {
    await request(`/resources/${route.params.id}`, { method: 'DELETE' })
    router.replace('/resources')
  } catch (e) {
    error.value = e.message
  }
}

async function postComment() {
  if (!requireLogin(router)) return
  commenting.value = true
  commentError.value = ''
  try {
    const data = await request(`/resources/${route.params.id}/comments`, {
      method: 'POST',
      body: { body: commentText.value },
    })
    comments.value = [...comments.value, data.comment]
    commentText.value = ''
  } catch (e) {
    commentError.value = e.message
  } finally {
    commenting.value = false
  }
}

async function removeComment(id) {
  if (!confirm('确定删除这条评论？')) return
  try {
    await request(`/resources/comments/${id}`, { method: 'DELETE' })
    comments.value = comments.value.filter((c) => c.id !== id)
  } catch (e) {
    commentError.value = e.message
  }
}

onMounted(load)
</script>

<style scoped>
.wrap {
  display: grid;
  gap: 1rem;
}

.detail,
.comments {
  padding: 1.25rem 1.35rem;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.cat {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(31, 122, 77, 0.12);
  color: var(--accent);
}

h1 {
  margin: 0 0 0.5rem;
  font-family: var(--display);
  font-size: 1.7rem;
}

h2 {
  margin: 0 0 0.85rem;
  font-size: 1.1rem;
}

.desc {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
  white-space: pre-wrap;
}

.meta {
  display: flex;
  gap: 0.75rem;
  margin: 0.85rem 0 1rem;
  font-size: 0.88rem;
}

.edit-form,
.comment-form {
  display: grid;
  gap: 0.75rem;
}

textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  background: #fff;
}

.comment {
  padding: 0.85rem 0;
  border-top: 1px solid var(--line);
}

.comment-top {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.35rem;
}

.comment p {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.45;
}

.link-del {
  border: none;
  background: none;
  color: #a33;
  cursor: pointer;
  font-size: 0.85rem;
  margin-left: auto;
}

.empty {
  margin: 0.5rem 0 0;
}

.back {
  text-decoration: none;
  font-size: 0.92rem;
}
</style>
