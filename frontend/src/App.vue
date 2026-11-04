<template>
  <div class="shell" :class="{ bare: isBare, 'has-sidebar': showNav && !isBare }">
    <!-- 装饰层永远在内容之下，且不接收点击 -->
    <SakuraPetals v-if="showAmbientPetals" :count="14" />

    <!-- 电脑端：左侧竖向菜单 -->
    <aside v-if="showNav && !isBare" class="sidebar desktop-only">
      <RouterLink to="/hub" class="brand-block">
        <div class="brand">
          <SakuraMark size="sm" />
          南信大互助平台
        </div>
        <p class="muted tagline">The Greatest NUIST</p>
      </RouterLink>
      <nav class="nav nav-side">
        <template v-for="link in navLinks" :key="link.to + link.label">
          <RouterLink :to="link.to" :class="{ 'nav-back': link.back }">{{ link.label }}</RouterLink>
        </template>
      </nav>
      <RouterLink class="welcome-link muted" :to="{ path: '/', query: { stay: '1' } }">
        樱花欢迎页
      </RouterLink>
    </aside>

    <!-- 只用一个 RouterView，避免登录页 ↔ 主站切换时双实例抢挂载 -->
    <div :class="isBare ? 'bare-main' : 'main'">
      <template v-if="!isBare">
        <header class="top">
          <div class="mobile-only mobile-brand">
            <RouterLink to="/hub" class="brand-block">
              <div class="brand">
                <SakuraMark size="sm" />
                南信大互助平台
              </div>
              <p class="muted tagline">The Greatest NUIST</p>
            </RouterLink>
            <div class="quick">
              <RouterLink
                v-if="guestMode"
                :to="{ name: 'login', query: { redirect: route.fullPath, reason: 'guest' } }"
                class="chip guest"
              >
                访客 · 去注册
              </RouterLink>
              <RouterLink v-else-if="loggedIn" to="/feedback" class="chip">反馈</RouterLink>
              <RouterLink v-if="loggedIn" to="/messages" class="chip msg">
                消息
                <span v-if="unread > 0" class="badge">{{ unread > 99 ? '99+' : unread }}</span>
              </RouterLink>
              <RouterLink
                v-else
                :to="{ name: 'login', query: { redirect: route.fullPath } }"
                class="chip login"
              >
                登录
              </RouterLink>
            </div>
          </div>

          <nav v-if="showNav" class="nav nav-top mobile-only">
            <template v-for="link in navLinks" :key="'m-' + link.to + link.label">
              <RouterLink :to="link.to" :class="{ 'nav-back': link.back }">{{ link.label }}</RouterLink>
            </template>
          </nav>

          <div class="top-row desktop-only">
            <div class="page-title muted">{{ sectionLabel }}</div>
            <div class="quick">
              <RouterLink
                v-if="guestMode"
                :to="{ name: 'login', query: { redirect: route.fullPath, reason: 'guest' } }"
                class="chip guest"
              >
                访客 · 去注册
              </RouterLink>
              <RouterLink v-else-if="loggedIn" to="/feedback" class="chip">反馈</RouterLink>
              <RouterLink v-if="loggedIn" to="/messages" class="chip msg">
                消息
                <span v-if="unread > 0" class="badge">{{ unread > 99 ? '99+' : unread }}</span>
              </RouterLink>
              <RouterLink
                v-else
                :to="{ name: 'login', query: { redirect: route.fullPath } }"
                class="chip login"
              >
                登录
              </RouterLink>
            </div>
          </div>
        </header>
        <p v-if="guestMode" class="guest-banner muted">当前为访客模式，只能浏览；发帖、发单、对战等需注册账号</p>
      </template>
      <RouterView />
    </div>

    <AnnounceModal
      v-if="currentAnnounce && !isBare"
      :key="currentAnnounce.id"
      :message="currentAnnounce"
      @dismiss="onDismissAnnounce"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getToken, getUser, isGuest, isLoggedIn, request } from './api/request'

const AnnounceModal = defineAsyncComponent(() => import('./components/AnnounceModal.vue'))
const SakuraMark = defineAsyncComponent(() => import('./components/SakuraMark.vue'))
const SakuraPetals = defineAsyncComponent(() => import('./components/SakuraPetals.vue'))

const route = useRoute()
const router = useRouter()
const unread = ref(0)
const announceQueue = ref([])
const isBare = computed(() => !!route.meta.bare)
const showNav = computed(() => route.name !== 'login' && !isBare.value)
const preferLiteFx = ref(
  typeof window !== 'undefined' &&
    (!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ||
      !!navigator.connection?.saveData)
)

watch(
  isBare,
  (bare) => {
    document.body.classList.toggle('is-bare', !!bare)
  },
  { immediate: true }
)
const loggedIn = computed(() => {
  void route.fullPath
  return isLoggedIn()
})
const guestMode = computed(() => {
  void route.fullPath
  return isGuest()
})
const writePaths = new Set([
  '/forum/new',
  '/changelog/new',
  '/resources/new',
  '/post',
  '/arcade/pool',
  '/arcade/skull',
  '/arcade/tank',
  '/arcade/curling',
])
const currentAnnounce = computed(() => announceQueue.value[0] || null)
const inForum = computed(() => String(route.path).startsWith('/forum'))
const inChangelog = computed(() => String(route.path).startsWith('/changelog'))
const inResources = computed(() => String(route.path).startsWith('/resources'))
const inGames = computed(() => String(route.path).startsWith('/games'))
const inArcade = computed(() => String(route.path).startsWith('/arcade'))
const showAmbientPetals = computed(
  () => !isBare.value && !inArcade.value && !preferLiteFx.value
)
const inSchedule = computed(() => String(route.path).startsWith('/schedule'))
const inHomework = computed(() => String(route.path).startsWith('/homework'))
const inVideo = computed(() => String(route.path).startsWith('/video'))
const inPickup = computed(
  () =>
    route.path === '/pickup' ||
    route.path === '/post' ||
    String(route.path).startsWith('/orders')
)

const sectionLabel = computed(() => {
  if (inForum.value) return '校园论坛'
  if (inChangelog.value) return '更新日志'
  if (inResources.value) return '资源库'
  if (inGames.value) return '校内开黑'
  if (inArcade.value) return '小游戏'
  if (inSchedule.value) return '我的课表'
  if (inHomework.value) return '学习通作业'
  if (inVideo.value) return '视频解析'
  if (inPickup.value) return '代拿快递'
  if (route.path === '/profile' || route.path === '/feedback' || route.path === '/messages') {
    return '个人中心'
  }
  return '首页'
})

const navLinks = computed(() => {
  const hideWrite = guestMode.value
  const filterWrite = (links) =>
    hideWrite ? links.filter((l) => !writePaths.has(l.to)) : links

  if (inForum.value) {
    return filterWrite([
      { to: '/hub', label: '← 返回', back: true },
      { to: '/forum', label: '论坛' },
      { to: '/forum/new', label: '发帖' },
      { to: '/profile', label: '我的' },
    ])
  }
  if (inChangelog.value) {
    const links = [
      { to: '/hub', label: '← 返回', back: true },
      { to: '/changelog', label: '日志' },
      ...(getUser()?.is_admin ? [{ to: '/changelog/new', label: '发布' }] : []),
      { to: '/profile', label: '我的' },
    ]
    return filterWrite(links)
  }
  if (inResources.value) {
    return filterWrite([
      { to: '/hub', label: '← 返回', back: true },
      { to: '/resources', label: '资源' },
      { to: '/resources/new', label: '上传' },
      { to: '/profile', label: '我的' },
    ])
  }
  if (inGames.value) {
    return [
      { to: '/hub', label: '← 返回', back: true },
      { to: '/games', label: '开黑' },
      { to: '/profile', label: '我的' },
    ]
  }
  if (inArcade.value) {
    return filterWrite([
      { to: '/hub', label: '← 返回', back: true },
      { to: '/arcade', label: '大厅' },
      { to: '/arcade/pool', label: '台球' },
      { to: '/arcade/skull', label: '骷髅牌' },
      { to: '/arcade/tank', label: '坦克' },
      { to: '/arcade/curling', label: '冰壶' },
      { to: '/profile', label: '我的' },
    ])
  }
  if (inSchedule.value) {
    return [
      { to: '/hub', label: '← 返回', back: true },
      { to: '/schedule', label: '课表' },
      { to: '/homework', label: '作业' },
      { to: '/profile', label: '我的' },
    ]
  }
  if (inHomework.value) {
    return [
      { to: '/hub', label: '← 返回', back: true },
      { to: '/homework', label: '作业' },
      { to: '/schedule', label: '课表' },
      { to: '/profile', label: '我的' },
    ]
  }
  if (inVideo.value) {
    return [
      { to: '/hub', label: '← 返回', back: true },
      { to: '/video', label: '视频解析' },
      { to: '/profile', label: '我的' },
    ]
  }
  if (inPickup.value) {
    return filterWrite([
      { to: '/hub', label: '← 返回', back: true },
      { to: '/pickup', label: '大厅' },
      { to: '/post', label: '发单' },
      { to: '/profile', label: '我的' },
    ])
  }
  return [
    { to: '/forum', label: '论坛' },
    { to: '/changelog', label: '更新' },
    { to: '/pickup', label: '代拿' },
    { to: '/resources', label: '资源' },
    { to: '/games', label: '开黑' },
    { to: '/arcade', label: '小游戏' },
    { to: '/schedule', label: '课表' },
    { to: '/homework', label: '作业' },
    { to: '/video', label: '视频' },
    { to: '/profile', label: '我的' },
  ]
})

async function refreshUnread() {
  if (!getToken() || !showNav.value || isGuest()) {
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

async function refreshAnnouncements() {
  if (!getToken() || isBare.value || isGuest()) {
    announceQueue.value = []
    document.body.style.overflow = ''
    return
  }
  try {
    const data = await request('/inbox/announcements/unread')
    announceQueue.value = data.announcements || []
  } catch {
    /* ignore */
  }
}

function clearUiBlockers() {
  // 公告以外的残留层：樱花暴风、登录页遗留的 body 锁
  document.body.style.overflow = currentAnnounce.value && !isBare.value ? 'hidden' : ''
  document.querySelectorAll('.nuist-sakura-storm').forEach((el) => el.remove())
}

async function onDismissAnnounce(message, nextLink) {
  const id = message?.id
  // 先关弹窗，避免接口卡住时整页点不了
  announceQueue.value = announceQueue.value.filter((m) => m.id !== id)
  clearUiBlockers()
  try {
    if (id != null) {
      await request(`/inbox/messages/${id}/read`, { method: 'POST' })
    }
  } catch {
    /* still closed locally */
  }
  refreshUnread()
  if (nextLink) {
    if (/^https?:\/\//i.test(nextLink)) window.open(nextLink, '_blank', 'noopener')
    else router.push(nextLink)
  }
}

watch(
  () => route.fullPath,
  () => {
    clearUiBlockers()
    // 路由切换后再拉收件箱，避免挡住首屏
    scheduleInboxRefresh()
  }
)

watch(currentAnnounce, (m) => {
  document.body.style.overflow = m && !isBare.value ? 'hidden' : ''
})

function scheduleInboxRefresh() {
  if (isBare.value) return
  const run = () => {
    refreshUnread()
    refreshAnnouncements()
  }
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1800 })
  } else {
    setTimeout(run, 400)
  }
}

onMounted(() => {
  scheduleInboxRefresh()
  window.addEventListener('nuist-unread-refresh', refreshUnread)
  window.addEventListener('nuist-unread-refresh', refreshAnnouncements)
})

onUnmounted(() => {
  document.body.style.overflow = ''
  document.body.classList.remove('is-bare')
  window.removeEventListener('nuist-unread-refresh', refreshUnread)
  window.removeEventListener('nuist-unread-refresh', refreshAnnouncements)
})
</script>

<style scoped>
.shell {
  position: relative;
  isolation: isolate;
}

.shell.has-sidebar {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 1.25rem 1.5rem;
  width: min(1120px, calc(100% - 32px));
  align-items: start;
}

.sidebar {
  position: sticky;
  top: 1rem;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: calc(100dvh - 2rem);
  padding: 1.1rem 0.9rem 1.2rem;
  border-radius: var(--radius);
  background:
    radial-gradient(120px 80px at 100% 0%, rgba(248, 215, 228, 0.55), transparent 70%),
    rgba(255, 255, 255, 0.82);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  animation: rise 0.45s ease both;
}

.brand-block {
  display: block;
  text-decoration: none;
  color: inherit;
  padding: 0.15rem 0.35rem 0.35rem;
}

.brand-block .brand {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 1.35rem;
  line-height: 1.25;
}

.brand-block .tagline {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
}

.welcome-link {
  margin-top: auto;
  padding: 0.45rem 0.85rem;
  font-size: 0.78rem;
  text-decoration: none;
  border-radius: 10px;
}

.welcome-link:hover {
  color: #a34e72;
  background: rgba(248, 215, 228, 0.45);
}

.nav-side {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.nav-side a {
  display: block;
  padding: 0.55rem 0.85rem;
  border-radius: 12px;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
}

.nav-side a:hover {
  background: rgba(15, 47, 36, 0.06);
  color: var(--ink);
}

.nav-side a.router-link-active {
  background: var(--bg-deep);
  color: #fff;
}

.nav a.nav-back {
  color: var(--ink);
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.95);
  margin-bottom: 0.25rem;
}

.nav-side a.nav-back.router-link-active {
  background: rgba(255, 255, 255, 0.95);
  color: var(--ink);
}

.main,
.bare-main {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.main {
  animation: rise 0.5s ease both;
}

.bare-main {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
}

.top {
  margin-bottom: 1rem;
  display: grid;
  gap: 0.75rem;
}

.top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.page-title {
  font-weight: 700;
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
  text-decoration: none;
}

.chip.router-link-active {
  background: var(--bg-deep);
  color: #fff;
  border-color: transparent;
}

.chip.login {
  background: #409eff;
  border-color: transparent;
  color: #fff;
}

.chip.guest {
  background: rgba(64, 158, 255, 0.12);
  border-color: rgba(64, 158, 255, 0.35);
  color: #337ecc;
}

.guest-banner {
  margin: -0.35rem 0 0.85rem;
  padding: 0.55rem 0.8rem;
  border-radius: 10px;
  background: rgba(64, 158, 255, 0.1);
  border: 1px solid rgba(64, 158, 255, 0.22);
  font-size: 0.86rem;
  line-height: 1.45;
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

.mobile-only {
  display: none;
}

.desktop-only {
  display: flex;
}

.sidebar.desktop-only {
  display: flex;
}

.nav-top {
  display: none;
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

/* 手机端：取消左侧菜单，改用顶部横排导航 */
@media (max-width: 860px) {
  .shell.has-sidebar {
    display: block;
    width: min(960px, calc(100% - 24px));
  }

  .desktop-only {
    display: none !important;
  }

  .mobile-only {
    display: block;
  }

  .mobile-brand {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .mobile-brand .brand {
    font-size: clamp(1.45rem, 6vw, 1.9rem);
  }

  .nav-top {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    padding: 0.45rem;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid var(--line);
  }

  .nav-top a {
    padding: 0.4rem 0.75rem;
    border-radius: 999px;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.88rem;
    text-decoration: none;
  }

  .nav-top a.router-link-active {
    background: var(--bg-deep);
    color: #fff;
  }

  .nav-top a.nav-back {
    margin-bottom: 0;
  }

  .nav-top a.nav-back.router-link-active {
    background: rgba(255, 255, 255, 0.95);
    color: var(--ink);
  }
}
</style>
