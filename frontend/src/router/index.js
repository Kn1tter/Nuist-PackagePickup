import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api/request'

const routes = [
  { path: '/', name: 'orders', component: () => import('../views/Orders.vue') },
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
  if (to.meta.guest && loggedIn) return { name: 'orders' }
  return true
})

export default router
