import { createRouter, createWebHistory } from 'vue-router'
import { getToken, isGuest } from '../api/request'

const TITLE_SUFFIX = '南信大互助平台'

const routes = [
  {
    path: '/',
    name: 'welcome',
    component: () => import('../views/Welcome.vue'),
    meta: { bare: true, title: '欢迎' },
  },
  { path: '/hub', name: 'hub', component: () => import('../views/Hub.vue'), meta: { title: '首页' } },
  {
    path: '/history-today',
    name: 'history-today',
    component: () => import('../views/HistoryToday.vue'),
    meta: { title: '历史上的今天' },
  },
  {
    path: '/app',
    name: 'chocolate-ledger',
    component: () => import('../views/ChocolateLedger.vue'),
    meta: { bare: true, title: '巧克力记账' },
  },
  { path: '/chocolate-ledger', redirect: '/app' },
  { path: '/forum', name: 'forum', component: () => import('../views/Forum.vue'), meta: { title: '校园论坛' } },
  {
    path: '/forum/new',
    name: 'forum-new',
    component: () => import('../views/ForumNew.vue'),
    meta: { auth: true, member: true, title: '发帖' },
  },
  {
    path: '/forum/:id',
    name: 'forum-post',
    component: () => import('../views/ForumPost.vue'),
    meta: { title: '帖子' },
  },
  {
    path: '/changelog',
    name: 'changelog',
    component: () => import('../views/Changelog.vue'),
    meta: { title: '更新日志' },
  },
  {
    path: '/changelog/new',
    name: 'changelog-new',
    component: () => import('../views/ChangelogNew.vue'),
    meta: { auth: true, member: true, title: '发布更新' },
  },
  {
    path: '/changelog/:id',
    name: 'changelog-post',
    component: () => import('../views/ChangelogPost.vue'),
    meta: { title: '更新详情' },
  },
  {
    path: '/resources',
    name: 'resources',
    component: () => import('../views/Resources.vue'),
    meta: { title: '资源库' },
  },
  {
    path: '/resources/new',
    name: 'resource-new',
    component: () => import('../views/ResourceNew.vue'),
    meta: { auth: true, member: true, title: '上传资源' },
  },
  {
    path: '/resources/:id',
    name: 'resource-detail',
    component: () => import('../views/ResourceDetail.vue'),
    meta: { title: '资源详情' },
  },
  { path: '/games', name: 'games', component: () => import('../views/Games.vue'), meta: { title: '校内开黑' } },
  {
    path: '/games/:id',
    name: 'game-group',
    component: () => import('../views/GameGroup.vue'),
    meta: { title: '开黑房间' },
  },
  {
    path: '/arcade',
    name: 'arcade',
    component: () => import('../views/Arcade.vue'),
    meta: { auth: true, title: '小游戏' },
  },
  {
    path: '/arcade/pool',
    name: 'pool',
    component: () => import('../views/PoolGame.vue'),
    meta: { auth: true, member: true, title: '台球' },
  },
  {
    path: '/arcade/skull',
    name: 'skull',
    component: () => import('../views/SkullGame.vue'),
    meta: { auth: true, member: true, title: '骷髅牌' },
  },
  {
    path: '/arcade/tank',
    name: 'tank',
    component: () => import('../views/TankGame.vue'),
    meta: { auth: true, member: true, title: '坦克弹弹堂' },
  },
  {
    path: '/arcade/dino',
    name: 'dino',
    component: () => import('../views/DinoGame.vue'),
    meta: { auth: true, member: true, title: '小恐龙' },
  },
  {
    path: '/arcade/curling',
    name: 'curling',
    component: () => import('../views/CurlingGame.vue'),
    meta: { auth: true, member: true, title: '冰壶' },
  },
  {
    path: '/schedule',
    name: 'schedule',
    component: () => import('../views/Schedule.vue'),
    meta: { auth: true, title: '我的课表' },
  },
  {
    path: '/homework',
    name: 'homework',
    component: () => import('../views/Homework.vue'),
    meta: { auth: true, member: true, title: '学习通作业' },
  },
  {
    path: '/video',
    name: 'video',
    component: () => import('../views/VideoDownload.vue'),
    meta: { title: '视频解析' },
  },
  {
    path: '/schedule/float',
    name: 'schedule-float',
    component: () => import('../views/ScheduleFloat.vue'),
    meta: { bare: true, title: '课表悬浮窗' },
  },
  { path: '/pickup', name: 'orders', component: () => import('../views/Orders.vue'), meta: { title: '代拿快递' } },
  {
    path: '/post',
    name: 'home',
    component: () => import('../views/Home.vue'),
    meta: { auth: true, member: true, title: '发单' },
  },
  {
    path: '/orders/:id',
    name: 'detail',
    component: () => import('../views/OrderDetail.vue'),
    meta: { title: '订单详情' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/Profile.vue'),
    meta: { auth: true, title: '个人中心' },
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('../views/AdminUsers.vue'),
    meta: { auth: true, member: true, title: '用户管理' },
  },
  {
    path: '/feedback',
    name: 'feedback',
    component: () => import('../views/Feedback.vue'),
    meta: { auth: true, member: true, title: '反馈' },
  },
  {
    path: '/messages',
    name: 'messages',
    component: () => import('../views/Messages.vue'),
    meta: { auth: true, title: '消息' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true, bare: true, title: '登录' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFound.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0, left: 0 }
  },
})

router.beforeEach((to) => {
  const loggedIn = !!getToken()
  // 仅「纯操作/个人页」要求登录；浏览页游客可进，操作时再跳登录
  if (to.meta.auth && !loggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.member && isGuest()) {
    return { name: 'login', query: { redirect: to.fullPath, reason: 'guest' } }
  }
  // 访客可进登录页以便升级为正式账号；正式用户已登录则回首页
  if (to.meta.guest && loggedIn && !isGuest()) return { name: 'hub' }
  // 已登录正式用户打开 / 直接进平台（免加载欢迎页大图）；侧栏 stay=1 除外
  if (
    to.name === 'welcome' &&
    to.query.stay !== '1' &&
    to.query.view !== 'welcome' &&
    loggedIn &&
    !isGuest()
  ) {
    return { name: 'hub' }
  }
  return true
})

router.afterEach((to) => {
  const page = to.meta?.title
  document.title = page ? `${page} · ${TITLE_SUFFIX}` : `${TITLE_SUFFIX} · The Greatest NUIST`
})

export default router
