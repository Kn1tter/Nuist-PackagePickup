<template>
  <div class="shell">
    <header class="top">
      <div class="top-row">
        <RouterLink to="/" class="brand-block">
          <div class="brand">南信大互助</div>
          <p class="muted tagline">Make NUIST Better</p>
        </RouterLink>
        <div v-if="showNav" class="quick">
          <RouterLink to="/feedback" class="chip">反馈</RouterLink>
          <RouterLink to="/messages" class="chip msg">
            消息
            <span v-if="unread > 0" class="badge">{{ unread > 99 ? '99+' : unread }}</span>
          </RouterLink>
        </div>
      </div>
      <nav v-if="showNav" class="nav">
        <template v-if="inForum">
          <RouterLink to="/forum">论坛</RouterLink>
          <RouterLink to="/forum/new">发帖</RouterLink>
          <RouterLink to="/">首页</RouterLink>
          <RouterLink to="/profile">我的</RouterLink>
        </template>
        <template v-else-if="inResources">
          <RouterLink to="/resources">资源</RouterLink>
          <RouterLink to="/resources/new">上传</RouterLink>
          <RouterLink to="/">首页</RouterLink>
          <RouterLink to="/profile">我的</RouterLink>
        </template>
        <template v-else-if="inPickup">
          <RouterLink to="/pickup">大厅</RouterLink>
          <RouterLink to="/post">发单</RouterLink>
          <RouterLink to="/">首页</RouterLink>
          <RouterLink to="/profile">我的</RouterLink>
        </template>
        <template v-else>
          <RouterLink to="/forum">论坛</RouterLink>
          <RouterLink to="/pickup">代拿</RouterLink>
          <RouterLink to="/resources">资源</RouterLink>
          <RouterLink to="/profile">我的</RouterLink>
        </template>
      </nav>
    </header>
    <RouterView />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getToken, request } from './api/request'

const route = useRoute()
const unread = ref(0)
const showNav = computed(() => route.name !== 'login')
const inForum = computed(() => String(route.path).startsWith('/forum'))
const inResources = computed(() => String(route.path).startsWith('/resources'))
const inPickup = computed(
  () =>
    route.path === '/pickup' ||
    route.path === '/post' ||
    String(route.path).startsWith('/orders')
)

async function refreshUnread() {
  if (!getToken() || !showNav.value) {
    unread.value = 0
    return
  }
  try {
    const data = await request('/inbox/unread-count')
    unread.value = Number(data.count || 0)
  } catch {
    /* ignore */
  }
}

watch(
  () => route.fullPath,
  () => {
    refreshUnread()
  }
)

onMounted(() => {
  refreshUnread()
  window.addEventListener('nuist-unread-refresh', refreshUnread)
})

onUnmounted(() => {
  window.removeEventListener('nuist-unread-refresh', refreshUnread)
})
</script>

<style scoped>
.top {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-bottom: 1.5rem;
  animation: rise 0.5s ease both;
}

.top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.brand-block .tagline {
  margin: 0.2rem 0 0;
  font-size: 0.92rem;
}

.quick {
  display: flex;
  gap: 0.45rem;
  flex-shrink: 0;
}

.chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--line);
  color: var(--ink);
  font-weight: 700;
  font-size: 0.88rem;
}

.chip.router-link-active {
  background: var(--bg-deep);
  color: #fff;
  border-color: transparent;
}

.badge {
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  background: var(--accent-2);
  color: #fff;
  font-size: 0.7rem;
  line-height: 1.15rem;
  text-align: center;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  padding: 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--line);
  align-self: flex-start;
}

.nav a {
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.92rem;
}

.nav a.router-link-active {
  background: var(--bg-deep);
  color: #fff;
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
</style>
