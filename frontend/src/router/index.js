import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api/request'

const routes = [
  { path: '/', name: 'hub', component: () => import('../views/Hub.vue') },
  { path: '/forum', name: 'forum', component: () => import('../views/Forum.vue') },
  {
    path: '/forum/new',
    name: 'forum-new',
    component: () => import('../views/ForumNew.vue'),
    meta: { auth: true },
  },
  { path: '/forum/:id', name: 'forum-post', component: () => import('../views/ForumPost.vue') },
  { path: '/resources', name: 'resources', component: () => import('../views/Resources.vue') },
  {
    path: '/resources/new',
    name: 'resource-new',
    component: () => import('../views/ResourceNew.vue'),
    meta: { auth: true },
  },
  {
    path: '/resources/:id',
    name: 'resource-detail',
    component: () => import('../views/ResourceDetail.vue'),
  },
  { path: '/games', name: 'games', component: () => import('../views/Games.vue') },
  { path: '/games/:id', name: 'game-group', component: () => import('../views/GameGroup.vue') },
  {
    path: '/schedule',
    name: 'schedule',
    component: () => import('../views/Schedule.vue'),
    meta: { auth: true },
  },
  {
    path: '/schedule/float',
    name: 'schedule-float',
    component: () => import('../views/ScheduleFloat.vue'),
    meta: { bare: true },
  },
  { path: '/pickup', name: 'orders', component: () => import('../views/Orders.vue') },
  {
    path: '/post',
    name: 'home',
    component: () => import('../views/Home.vue'),
    meta: { auth: true },
  },
  { path: '/orders/:id', name: 'detail', component: () => import('../views/OrderDetail.vue') },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/Profile.vue'),
    meta: { auth: true },
  },
  {
    path: '/feedback',
    name: 'feedback',
    component: () => import('../views/Feedback.vue'),
    meta: { auth: true },
  },
  {
    path: '/messages',
    name: 'messages',
    component: () => import('../views/Messages.vue'),
    meta: { auth: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true, bare: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const loggedIn = !!getToken()
  // 仅「纯操作/个人页」要求登录；浏览页游客可进，操作时再跳登录
  if (to.meta.auth && !loggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guest && loggedIn) return { name: 'hub' }
  return true
})

export default router
