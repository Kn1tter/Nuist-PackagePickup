import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api/request'

const routes = [
  { path: '/', name: 'hub', component: () => import('../views/Hub.vue') },
  { path: '/forum', name: 'forum', component: () => import('../views/Forum.vue') },
  { path: '/forum/new', name: 'forum-new', component: () => import('../views/ForumNew.vue') },
  { path: '/forum/:id', name: 'forum-post', component: () => import('../views/ForumPost.vue') },
  { path: '/pickup', name: 'orders', component: () => import('../views/Orders.vue') },
  { path: '/post', name: 'home', component: () => import('../views/Home.vue') },
  { path: '/orders/:id', name: 'detail', component: () => import('../views/OrderDetail.vue') },
  { path: '/profile', name: 'profile', component: () => import('../views/Profile.vue') },
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { guest: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const loggedIn = !!getToken()
  if (!to.meta.guest && !loggedIn) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.meta.guest && loggedIn) return { name: 'hub' }
  return true
})

export default router
