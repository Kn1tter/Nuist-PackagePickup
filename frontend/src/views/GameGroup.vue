<template>
  <main v-if="group" class="wrap">
    <section class="panel head">
      <div class="title-row">
        <div>
          <h1>{{ group.name }}</h1>
          <p class="muted">
            创建者 {{ group.creator_name || '同学' }} · {{ members.length }} 名成员
          </p>
        </div>
        <div class="actions">
          <button v-if="!group.joined" class="btn" type="button" @click="join">加入本组</button>
          <button
            v-else-if="!group.can_manage"
            class="btn ghost"
            type="button"
            @click="leave"
          >
            退出
          </button>
          <button v-if="group.can_manage" class="btn ghost danger" type="button" @click="removeGroup">
            删除组
          </button>
        </div>
      </div>
      <p v-if="group.description" class="desc">{{ group.description }}</p>
    </section>

    <section v-if="group.joined" class="panel invite-form">
      <h2>发开黑邀请</h2>
      <form @submit.prevent="postInvite">
        <div class="field">
          <label>标题</label>
          <input v-model="invite.title" maxlength="120" placeholder="今晚双排 / 缺一补一" required />
        </div>
        <div class="field">
          <label>详情</label>
          <textarea
            v-model="invite.body"
            rows="3"
            maxlength="1000"
            placeholder="时间、段位、语音方式…"
            required
          />
        </div>
        <div class="field">
          <label>联系方式（可选）</label>
          <input v-model="invite.contact" maxlength="80" placeholder="QQ / 微信 / 游戏 ID" />
        </div>
        <p v-if="inviteError" class="err">{{ inviteError }}</p>
        <button class="btn" type="submit" :disabled="posting">
          {{ posting ? '发布中…' : '发布邀请' }}
        </button>
      </form>
    </section>
    <p v-else class="hint muted">加入本组后才能发布开黑邀请。</p>

    <section class="invites">
      <h2>开黑邀请</h2>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="!invites.length" class="muted">暂时没有邀请。</p>
      <article v-for="i in invites" :key="i.id" class="panel card" :class="{ closed: i.status !== 'open' }">
        <div class="card-top">
          <strong>{{ i.title }}</strong>
          <span class="status" :class="i.status">{{ i.status === 'open' ? '招募中' : '已结束' }}</span>
        </div>
        <p class="body">{{ i.body }}</p>
        <div class="meta muted">
          <span>{{ i.nickname || '同学' }}</span>
          <span v-if="i.contact">联系：{{ i.contact }}</span>
          <span>{{ formatTime(i.created_at) }}</span>
        </div>
        <div v-if="i.can_delete" class="card-actions">
          <button
            v-if="i.status === 'open'"
            class="btn ghost"
            type="button"
            @click="closeInvite(i.id)"
          >
            结束招募
          </button>
          <button class="link-del" type="button" @click="deleteInvite(i.id)">删除</button>
        </div>
      </article>
    </section>

    <section class="panel members">
      <h2>成员</h2>
      <ul>
        <li v-for="m in members" :key="m.user_id">
          {{ m.nickname || '同学' }}
          <span class="muted">{{ m.student_id }}</span>
        </li>
      </ul>
    </section>
  </main>
  <p v-else-if="error" class="err">{{ error }}</p>
  <p v-else class="muted">加载中…</p>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request } from '../api/request'

const route = useRoute()
const router = useRouter()
const group = ref(null)
const members = ref([])
const invites = ref([])
const error = ref('')
const posting = ref(false)
const inviteError = ref('')
const invite = reactive({ title: '', body: '', contact: '' })

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16)
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function load() {
  error.value = ''
  try {
    const data = await request(`/games/groups/${route.params.id}`)
    group.value = data.group
    members.value = data.members || []
    invites.value = data.invites || []
  } catch (e) {
    error.value = e.message
  }
}

async function join() {
  try {
    await request(`/games/groups/${route.params.id}/join`, { method: 'POST' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function leave() {
  try {
    await request(`/games/groups/${route.params.id}/leave`, { method: 'POST' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function removeGroup() {
  if (!confirm('确定删除该游戏组？邀请也会一起删除。')) return
  try {
    await request(`/games/groups/${route.params.id}`, { method: 'DELETE' })
    router.replace('/games')
  } catch (e) {
    error.value = e.message
  }
}

async function postInvite() {
  posting.value = true
  inviteError.value = ''
  try {
    await request(`/games/groups/${route.params.id}/invites`, {
      method: 'POST',
      body: { ...invite },
    })
    invite.title = ''
    invite.body = ''
    invite.contact = ''
    await load()
  } catch (e) {
    inviteError.value = e.message
  } finally {
    posting.value = false
  }
}

async function closeInvite(id) {
  try {
    await request(`/games/invites/${id}/close`, { method: 'POST' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function deleteInvite(id) {
  if (!confirm('确定删除这条邀请？')) return
  try {
    await request(`/games/invites/${id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

onMounted(load)
</script>

<style scoped>
.wrap {
  display: grid;
  gap: 1rem;
}

.head,
.invite-form,
.card,
.members {
  padding: 1.2rem 1.3rem;
}

.title-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.7rem;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.desc {
  margin: 0.75rem 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.danger {
  color: #a33 !important;
  border-color: rgba(163, 51, 51, 0.25) !important;
}

textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  background: #fff;
}

.hint {
  margin: 0;
}

.invites {
  display: grid;
  gap: 0.75rem;
}

.card.closed {
  opacity: 0.72;
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.4rem;
}

.body {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 0.65rem;
  font-size: 0.88rem;
}

.card-actions {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  margin-top: 0.75rem;
}

.link-del {
  border: none;
  background: none;
  color: #a33;
  cursor: pointer;
  font-size: 0.85rem;
}

.status.open {
  background: #fff1df;
  color: #a85a1a;
}

.status.closed {
  background: #e6e6e6;
  color: #555;
}

.members ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.members li {
  display: flex;
  gap: 0.65rem;
  justify-content: space-between;
}
</style>
