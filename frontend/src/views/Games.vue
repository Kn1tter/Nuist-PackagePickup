<template>
  <main>
    <div class="hero panel">
      <div>
        <h1>校内开黑</h1>
        <p class="muted">建游戏组 · 加入 · 发开黑邀请</p>
      </div>
      <button class="btn" type="button" @click="showCreate = !showCreate">
        {{ showCreate ? '收起' : '新建游戏组' }}
      </button>
    </div>

    <form v-if="showCreate" class="panel create" @submit.prevent="createGroup">
      <div class="field">
        <label>游戏名</label>
        <input v-model="form.name" maxlength="60" placeholder="如：永劫无间 / CS2 / 王者荣耀" required />
      </div>
      <div class="field">
        <label>简介（可选）</label>
        <input v-model="form.description" maxlength="500" placeholder="段位要求、常用模式等" />
      </div>
      <p v-if="formError" class="err">{{ formError }}</p>
      <button class="btn" type="submit" :disabled="creating">
        {{ creating ? '创建中…' : '创建并加入' }}
      </button>
    </form>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-else-if="loading" class="muted">加载中…</p>
    <p v-else-if="!groups.length" class="empty muted">还没有游戏组，去做第一个建组的人吧。</p>

    <div class="list">
      <article
        v-for="(g, i) in groups"
        :key="g.id"
        class="panel card"
        :style="{ animationDelay: `${i * 0.04}s` }"
        @click="go(g.id)"
      >
        <div class="top">
          <h2>{{ g.name }}</h2>
          <span v-if="g.joined" class="tag">已加入</span>
        </div>
        <p v-if="g.description" class="desc">{{ g.description }}</p>
        <div class="meta muted">
          <span>创建者 {{ g.creator_name || '同学' }}</span>
          <span>{{ g.member_count }} 人</span>
          <span>{{ g.open_invites }} 条开放邀请</span>
        </div>
      </article>
    </div>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '../api/request'

const router = useRouter()
const groups = ref([])
const loading = ref(true)
const error = ref('')
const showCreate = ref(false)
const creating = ref(false)
const formError = ref('')
const form = reactive({ name: '', description: '' })

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/games/groups')
    groups.value = data.groups || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function createGroup() {
  creating.value = true
  formError.value = ''
  try {
    const data = await request('/games/groups', { method: 'POST', body: { ...form } })
    form.name = ''
    form.description = ''
    showCreate.value = false
    router.push(`/games/${data.group.id}`)
  } catch (e) {
    formError.value = e.message
  } finally {
    creating.value = false
  }
}

function go(id) {
  router.push(`/games/${id}`)
}

onMounted(load)
</script>

<style scoped>
.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.4rem;
  margin-bottom: 1rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

.hero p {
  margin: 0.35rem 0 0;
}

.create {
  padding: 1.2rem 1.3rem;
  margin-bottom: 1rem;
}

.list {
  display: grid;
  gap: 0.85rem;
}

.card {
  padding: 1.1rem 1.2rem;
  cursor: pointer;
  animation: rise 0.4s ease both;
  transition: transform 0.15s ease;
}

.card:hover {
  transform: translateY(-2px);
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

h2 {
  margin: 0;
  font-size: 1.2rem;
}

.tag {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(31, 122, 77, 0.12);
  color: var(--accent);
}

.desc {
  margin: 0.45rem 0 0;
  color: var(--muted);
  line-height: 1.45;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.7rem;
  font-size: 0.88rem;
}

.empty {
  padding: 2rem 0;
  text-align: center;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 640px) {
  .hero {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
